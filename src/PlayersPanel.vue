<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { Users, RefreshCw, Gift } from 'lucide-vue-next';
import type { InstanceView, Player } from '../shared/types';
const props = defineProps<{ instance: InstanceView | undefined }>();
const players = ref<Player[]>([]), bridge = ref('unknown'), loading = ref(false), sending = ref(false), error = ref(''), receipt = ref('');
const selection = ref(''), itemId = ref(1), count = ref(1);
const online = computed(() => props.instance?.server.state === 'running');
const selected = computed(() => players.value.find(p => `${p.slot}:${p.name}` === selection.value));
let generation = 0, poll: ReturnType<typeof setInterval> | undefined;
async function refresh() {
  const instance = props.instance; if (!instance || !online.value || loading.value) return;
  const current = generation; loading.value = true;
  try {
    const response = await fetch(`/api/instances/${encodeURIComponent(instance.config.id)}/players`, { headers: { 'X-Tmod-Tools': '1' } });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '无法读取玩家列表');
    if (current !== generation) return;
    players.value = result.players; bridge.value = result.bridge;
    if (!selected.value) selection.value = ''; error.value = '';
  } catch (e) { if (current === generation) { error.value = e instanceof Error ? e.message : '无法读取玩家列表'; players.value = []; bridge.value = 'unavailable'; } }
  finally { if (current === generation) loading.value = false; }
}
watch([() => props.instance?.config.id, () => props.instance?.server.state], () => {
  generation++; clearInterval(poll); loading.value = false; players.value = []; selection.value = ''; error.value = ''; receipt.value = ''; bridge.value = 'unknown';
  if (online.value) { void refresh(); poll = setInterval(() => { if (!sending.value) void refresh(); }, 10000); }
}, { immediate: true });
onUnmounted(() => { generation++; clearInterval(poll); });
async function give() {
  const player = selected.value, instance = props.instance;
  if (!player || !instance || sending.value || !online.value || bridge.value !== 'ready') return;
  const current = generation; sending.value = true; receipt.value = ''; error.value = '';
  try {
    const response = await fetch(`/api/instances/${encodeURIComponent(instance.config.id)}/give`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tmod-Tools': '1' },
      body: JSON.stringify({ slot: player.slot, playerName: player.name, itemId: itemId.value, count: count.value }),
    });
    const result = await response.json(); if (!response.ok || result.ok === false) throw new Error(result.error || '物品发放失败');
    if (current !== generation) return;
    if (!result.item || result.item.delivery !== 'world-drop') throw new Error('服务器未返回完整发放回执，请先在游戏内核对，避免重复发放');
    receipt.value = `已在 ${result.item.player} 脚下生成 ${result.item.name} × ${result.item.count}，请玩家拾取。`;
  } catch (e) { if (current === generation) error.value = e instanceof Error ? e.message : '发放失败，请检查服务器回执'; }
  finally { sending.value = false; }
}
</script>

<template>
  <section class="panel settings-panel players-panel">
    <div class="panel-heading"><h2><Users :size="18" />在线玩家 <span class="tag">{{ players.length }}</span></h2><button class="secondary small" :disabled="!online||loading" @click="refresh()"><RefreshCw :size="14" :class="{spin:loading}" />刷新</button></div>
    <p v-if="!online" class="empty-mini">启动选中的服务器后，可查看在线玩家并发放物品。</p>
    <template v-else>
      <div v-if="error" class="notice warning" role="alert">{{ error }}</div>
      <div v-if="bridge!=='ready'" class="notice warning">{{ loading ? '正在连接玩家管理桥…' : '玩家管理桥尚未就绪，暂时不能发放物品。请确认服务器已启用管理 Mod。' }}</div>
      <div class="players-layout">
        <div class="players-list" aria-label="在线玩家列表">
          <button v-for="player in players" :key="`${player.slot}:${player.name}`" class="player-choice" :class="{chosen:selection===`${player.slot}:${player.name}`}" :aria-pressed="selection===`${player.slot}:${player.name}`" @click="selection=`${player.slot}:${player.name}`"><span class="player-avatar"><Users :size="17" /></span><span><strong>{{ player.name }}</strong><small>生命 {{ player.life }} / {{ player.maxLife }}</small></span><span class="player-slot">#{{ player.slot }}</span></button>
          <div v-if="!players.length" class="empty-mini">{{ loading ? '读取玩家列表…' : bridge==='ready' ? '当前没有玩家在线' : '等待玩家管理桥连接' }}</div>
        </div>
        <form class="give-form" @submit.prevent="give">
          <h3><Gift :size="16" />发放物品</h3><p>物品掉落在玩家脚下，由玩家拾取。</p>
          <label>接收玩家<select v-model="selection" :disabled="sending||!players.length" required><option disabled value="">请选择在线玩家</option><option v-for="player in players" :key="`${player.slot}:${player.name}`" :value="`${player.slot}:${player.name}`">{{ player.name }} · #{{ player.slot }}</option></select></label>
          <div class="form-grid"><label>物品 ID<input v-model.number="itemId" :disabled="sending" type="number" min="1" step="1" required /></label><label>数量<input v-model.number="count" :disabled="sending" type="number" min="1" max="9999" step="1" required /></label></div>
          <small>支持当前服务器已加载的原版与 Mod 物品 ID；服务器会校验有效 ID 与数量。</small>
          <button class="primary small" :disabled="sending||loading||!selected||bridge!=='ready'"><Gift :size="14" />{{ sending ? '等待服务器回执…' : '发放到玩家脚下' }}</button>
        </form>
      </div>
      <Transition name="page"><div v-if="receipt" class="give-receipt" role="status">{{ receipt }}</div></Transition>
    </template>
  </section>
</template>

<style scoped>
.panel-heading h2,.give-form h3{display:flex;align-items:center;gap:9px}.players-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,1fr);gap:28px}.players-list{min-width:0}.player-choice{display:flex;align-items:center;gap:12px;width:100%;padding:13px;border:1px solid #2d4037;border-radius:9px;background:#15241d;margin-bottom:10px;text-align:left;transition:background .18s,border-color .18s}.player-choice:hover,.player-choice.chosen{background:#274032;border-color:#6e9779}.player-choice strong{display:block;font-size:12px;overflow-wrap:anywhere}.player-choice small{display:block;font-size:10px;color:#93a99c;margin-top:6px}.player-avatar{display:flex;padding:10px;border-radius:8px;background:#304d3d;color:#bedbc8}.player-slot{margin-left:auto;color:#7f978a;font-size:10px}.give-form{display:flex;flex-direction:column;gap:15px}.give-form h3{font-size:13px}.give-form>p,.give-form>small{font-size:11px;line-height:1.8;color:#8ca497}.give-form>label{display:flex;flex-direction:column;gap:9px;font-size:11px;color:#aabac5}.give-form .primary{align-self:flex-end}.give-receipt{margin-top:20px;padding:15px;background:#213d2c;border:1px solid #4d7557;border-radius:9px;color:#b8debf;font-size:12px;line-height:1.8}.players-panel .notice{line-height:1.8}@media(max-width:760px){.players-layout{grid-template-columns:1fr}.give-form .form-grid{grid-template-columns:1fr 1fr}}
</style>
