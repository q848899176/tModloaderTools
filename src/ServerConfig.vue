<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Plus, Save, Server, FileText, Settings2, RotateCcw } from 'lucide-vue-next';
import type { AppState, InstanceConfig } from '../shared/types';
const props = defineProps<{ state: AppState; selectedId: string }>();
const emit = defineEmits<{ refresh: []; select: [id: string]; notify: [text: string, error?: boolean] }>();
const selected = computed(() => props.state.instances.find(i => i.config.id === props.selectedId));
const draft = ref<InstanceConfig>();
const raw = ref(''), baseline = ref(''), baselineRaw = ref('');
const mode = ref<'form' | 'text'>('form'), creating = ref(false), busy = ref(false);
const dirty = computed(() => mode.value === 'text' ? raw.value !== baselineRaw.value : (JSON.stringify(draft.value) || '') !== baseline.value);
const locked = computed(() => busy.value || props.state.busy || (!creating.value && !!selected.value && (!!selected.value.server.pid || !['stopped', 'error'].includes(selected.value.server.state))));
const labels: Record<string, string> = { stopped: '未运行', starting: '启动中', running: '运行中', stopping: '关闭中', error: '需要处理', external: '外部占用' };
function reset() {
  creating.value = false;
  draft.value = selected.value ? { ...selected.value.config } : undefined;
  baseline.value = JSON.stringify(draft.value) || '';
  raw.value = selected.value?.configText || ''; baselineRaw.value = raw.value;
}
watch(() => props.selectedId, reset, { immediate: true });
watch(() => selected.value?.config, () => { if (!dirty.value && !creating.value) reset(); }, { deep: true });
function choose(id: string) {
  if (busy.value) return;
  if (dirty.value) { emit('notify', '请先保存配置，或点击撤销修改后切换实例', true); return; }
  creating.value = false; emit('select', id);
}
function create() {
  if (busy.value || props.state.busy) return;
  if (dirty.value) { emit('notify', '请先保存配置，或点击撤销修改', true); return; }
  const s = props.state.settings;
  let port = 7777;
  while (props.state.instances.some(i => i.config.port === port) || port === s.webPort) port++;
  draft.value = { id: 'new', name: '新的服务器', world: props.state.worlds[0]?.name || '', port, maxPlayers: 8, password: '', motd: '', difficulty: 0, worldSize: 2, seed: '', secure: true, npcStream: 60 };
  creating.value = true; mode.value = 'form'; baseline.value = ''; raw.value = '';
}
function switchMode(next: 'form' | 'text') {
  if (mode.value === next) return;
  if (dirty.value) { emit('notify', '请先保存或撤销修改，再切换编辑方式', true); return; }
  mode.value = next;
}
async function save() {
  if (!draft.value || locked.value) return;
  busy.value = true;
  try {
    let id = draft.value.id;
    const wasCreating = creating.value;
    const existingIds = new Set(props.state.instances.map(instance => instance.config.id));
    const response = await fetch(`/api/instances${creating.value ? '' : `/${encodeURIComponent(id)}${mode.value === 'text' ? '/configText' : ''}`}`, {
      method: creating.value ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json', 'X-Tmod-Tools': '1' },
      body: JSON.stringify(mode.value === 'text' ? { text: raw.value } : draft.value),
    });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '配置保存失败');
    if (wasCreating) {
      const added = (result.instances as AppState['instances'] | undefined)?.find(instance => !existingIds.has(instance.config.id));
      if (!added) { emit('refresh'); throw new Error('实例已保存，但未返回新实例标识，请刷新列表核对后再操作'); }
      id = added.config.id; draft.value = { ...added.config };
    }
    creating.value = false; baseline.value = JSON.stringify(draft.value); baselineRaw.value = raw.value;
    emit('select', id); emit('refresh'); emit('notify', '服务器配置已保存，下次启动生效');
  } catch (error) { emit('notify', error instanceof Error ? error.message : '配置保存失败', true); }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="instance-layout">
    <section class="panel settings-panel instance-list">
      <div class="panel-heading"><h2><Server :size="17" />服务器实例</h2><button class="secondary small" :disabled="busy||state.busy" @click="create"><Plus :size="14" />新建</button></div>
      <button v-for="item in state.instances" :key="item.config.id" class="instance-option" :class="{chosen:item.config.id===selectedId&&!creating}" :aria-pressed="item.config.id===selectedId&&!creating" @click="choose(item.config.id)">
        <span><strong>{{ item.config.name }}</strong><small>{{ item.config.world || '尚未选择世界' }} · :{{ item.config.port }}</small></span><em :class="item.server.state">{{ labels[item.server.state] }}</em>
      </button>
      <p v-if="!state.instances.length" class="empty-mini">新建一个实例，为它选择世界与端口。</p>
      <p class="instance-note">每个实例独立保存配置。同一世界和端口不能同时被多个实例使用。</p>
    </section>
    <form v-if="draft" class="panel settings-panel instance-editor" @submit.prevent="save">
      <div class="panel-heading"><h2>{{ creating ? '新建服务器' : draft.name }}</h2><div v-if="!creating" class="tabs"><button type="button" :class="{active:mode==='form'}" @click="switchMode('form')"><Settings2 :size="13" />表单</button><button type="button" :class="{active:mode==='text'}" @click="switchMode('text')"><FileText :size="13" />配置文本</button></div></div>
      <div v-if="locked&&!busy" class="notice warning">{{ state.busy ? '后台正在处理配置，请稍后编辑。' : '实例运行或被占用时不能修改配置，请先停止服务器。' }}</div>
      <fieldset :disabled="locked">
        <div v-if="mode==='form'" class="form-grid">
          <label>实例名称<input v-model="draft.name" required maxlength="100" placeholder="例如：朋友的冒险服" /></label>
          <label>世界存档<select v-model="draft.world" required><option disabled value="">请选择已有世界</option><option v-for="world in state.worlds" :key="world.name" :value="world.name">{{ world.worldTitle || world.name }}</option><option v-if="draft.world&&!state.worlds.some(w=>w.name===draft!.world)" :value="draft.world">{{ draft.world }}（尚无存档）</option></select></label>
          <label>游戏端口<input v-model.number="draft.port" type="number" min="1024" max="65535" required /><small>每个同时运行的实例须使用不同端口。</small></label>
          <label>玩家人数上限<input v-model.number="draft.maxPlayers" type="number" min="1" max="255" required /></label>
          <label>连接密码<input v-model="draft.password" type="password" autocomplete="new-password" maxlength="500" placeholder="留空表示无需密码" /></label>
          <label>欢迎消息<input v-model="draft.motd" maxlength="500" placeholder="欢迎来到我们的世界" /></label>
          <label>新世界难度<select v-model.number="draft.difficulty"><option :value="0">普通</option><option :value="1">专家</option><option :value="2">大师</option><option :value="3">旅途</option></select><small>仅创建世界时生效，已有存档保留原难度。</small></label>
          <label>新世界大小<select v-model.number="draft.worldSize"><option :value="1">小型</option><option :value="2">中型</option><option :value="3">大型</option></select></label>
          <label>新世界种子<input v-model="draft.seed" maxlength="500" placeholder="留空随机生成" /></label>
          <label>NPC 同步速率<input v-model.number="draft.npcStream" type="number" min="0" max="300" required /></label>
          <label class="secure-option"><input v-model="draft.secure" type="checkbox" />启用服务器额外校验</label>
        </div>
        <label v-else class="config-source">serverconfig.txt<textarea v-model="raw" spellcheck="false" maxlength="32768" aria-label="服务器配置文本" /><small>编辑支持的 key=value 配置；世界路径须位于本机 Worlds 目录。</small></label>
      </fieldset>
      <div class="form-footer"><span>{{ dirty ? '有尚未保存的修改' : '配置已与服务器同步' }}</span><div class="button-row"><button type="button" class="secondary small" :disabled="busy" @click="reset"><RotateCcw :size="14" />撤销修改</button><button class="primary small" :disabled="locked||!dirty"><Save :size="14" />{{ busy ? '保存中…' : creating ? '创建实例' : '保存配置' }}</button></div></div>
    </form>
    <div v-else class="panel settings-panel empty-mini">选择左侧实例，或新建一个服务器。</div>
  </div>
</template>

<style scoped>
.instance-layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:20px;align-items:start}.instance-list{padding:20px}.panel-heading h2{display:flex;align-items:center;gap:9px}.instance-option{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;padding:14px 10px;border:1px solid transparent;border-radius:8px;gap:10px;margin:5px 0;background:transparent;transition:background .18s,border-color .18s}.instance-option:hover,.instance-option.chosen{background:#22352d;border-color:#3e6250}.instance-option span{min-width:0}.instance-option strong{display:block;font-size:12px;overflow-wrap:anywhere}.instance-option small{display:block;color:#85998f;margin-top:7px;font-size:10px;overflow-wrap:anywhere}.instance-option em{font-size:9px;font-style:normal;color:#8b9ba4;white-space:nowrap}.instance-option em.running{color:#add6b4}.instance-note{font-size:10px;line-height:1.8;color:#7f9691;margin-top:20px}.instance-editor{min-width:0}fieldset{padding:0;margin:0;border:0;min-width:0}fieldset:disabled{opacity:.65}.secure-option{flex-direction:row!important;align-items:center}.secure-option input{width:16px}.config-source{display:flex;flex-direction:column;gap:12px;color:#a4b6b0;font-size:12px}.config-source textarea{min-height:390px;resize:vertical;font:12px/1.8 Consolas,monospace;tab-size:2}.config-source small{font-size:10px;line-height:1.8}.tabs{display:flex;gap:3px}.tabs button{gap:5px;padding:7px}.tabs button.active{background:#2c4638;color:#c2e9c9}.instance-editor .panel-heading{gap:12px;flex-wrap:wrap}
@media(max-width:1100px){.instance-layout{grid-template-columns:1fr}.instance-list{margin-bottom:0}}@media(max-width:760px){.form-footer{align-items:center;flex-wrap:wrap}.form-footer>span{max-width:none}}
</style>
