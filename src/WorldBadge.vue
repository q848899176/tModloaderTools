<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(defineProps<{ evil: string; size?: number }>(), { size: 68 });
const kind = computed(() => props.evil === 'crimson' || props.evil === 'corruption' ? props.evil : 'unknown');
const label = computed(() => ({ crimson: '猩红世界', corruption: '腐化（暗影）世界', unknown: '世界类型未知' })[kind.value]);
</script>

<template>
  <svg class="world-badge" :class="kind" :width="size" :height="size" viewBox="0 0 64 64" role="img" :aria-label="label" shape-rendering="crispEdges">
    <title>{{ label }}</title>
    <ellipse cx="32" cy="57" rx="25" ry="4" fill="#061512" opacity=".5" />
    <path d="M10 45h44v9h-6v4H18v-4h-8Z" fill="#574a3d" />
    <path d="M14 48h36v5h-8v4H22v-4h-8Z" fill="#87705a" />
    <path d="M22 51h5v3h-5zm15-1h4v3h-4z" fill="#b29772" />
    <path d="M8 43h48v6H8zM13 40h7v4h-7zm31 0h7v4h-7z" class="canopy-dark" />
    <path d="M27 23h10v22h6v3H22v-3h5V33h-7v-5h7zm10 7h8v-5h4v9H37Z" fill="#9c7755" />
    <path d="M30 24h3v20h-3zm-8 6h6v3h-6z" fill="#d5ac77" />
    <g class="tree-crown">
      <path d="M24 7h17v5h8v6h6v11h-7v6H35v-5H22v3H11v-7H7V16h8v-5h9Z" class="canopy-dark" />
      <path d="M24 10h15v5h9v6h4v6H39v-4H26v5H14v-5h-4v-5h8v-4h6Z" class="canopy" />
      <path d="M25 11h11v4H25zm-8 7h10v4H17zm23 0h7v4h-7z" class="canopy-light" />
      <path d="M33 25h7v5h-7zm-19 4h5v4h-5z" class="canopy" />
    </g>
    <path d="M11 43h14v3H11zm29 0h11v3H40z" class="canopy-light" />
  </svg>
</template>

<style scoped>
.world-badge{flex-shrink:0;overflow:visible;--leaf:#7a8490;--light:#b4bfca;--dark:#444f5c;filter:drop-shadow(0 3px 5px #0003);transition:transform .2s ease}
.world-badge.crimson{--leaf:#cb4b59;--light:#ff8c82;--dark:#743246}
.world-badge.corruption{--leaf:#9564cb;--light:#c49cf5;--dark:#503669}
.canopy{fill:var(--leaf)}.canopy-light{fill:var(--light)}.canopy-dark{fill:var(--dark)}
.world-badge:hover{transform:translateY(-2px)}
@media(prefers-reduced-motion:reduce){.world-badge{transition:none}.world-badge:hover{transform:none}}
</style>
