<script setup lang="ts">
defineProps<{variant?:number}>();
const uid=`art-${Math.random().toString(36).slice(2)}`;
</script>
<template>
  <svg class="world-art" :class="`art-${variant||0}`" viewBox="0 0 760 380" fill="none" aria-hidden="true">
    <defs>
      <linearGradient :id="uid+'sky'" x2="0" y2="1"><stop stop-color="#183b40"/><stop offset="1" stop-color="#101f2b"/></linearGradient>
      <linearGradient :id="uid+'earth'" x2="0.3" y2="1"><stop stop-color="#294b3c"/><stop offset="1" stop-color="#112125"/></linearGradient>
      <radialGradient :id="uid+'glow'"><stop stop-color="#83e7c6" stop-opacity=".26"/><stop offset="1" stop-color="#83e7c6" stop-opacity="0"/></radialGradient>
      <linearGradient :id="uid+'water'" x2="0" y2="1"><stop stop-color="#66d9d4" stop-opacity=".9"/><stop offset="1" stop-color="#66d9d4" stop-opacity="0"/></linearGradient>
    </defs>
    <ellipse cx="480" cy="135" rx="230" ry="200" :fill="`url(#${uid}glow)`"/>
    <g fill="#b9eddd" class="art-stars"><circle cx="322" cy="70" r="1.5"/><circle cx="397" cy="30" r="1"/><circle cx="668" cy="82" r="1.5"/><circle cx="563" cy="24" r="1"/><circle cx="718" cy="145" r="1"/><circle cx="600" cy="122" r="1"/><path d="M590 63h8m-4-4v8" stroke="#add7c5"/></g>
    <circle cx="560" cy="80" r="25" fill="#ccf1d5"/><circle cx="570" cy="71" r="24" fill="#163335"/>
    <path d="M248 260 330 128 371 188 408 117 491 239 546 177 680 274Z" fill="#234347" opacity=".6"/>
    <path d="M289 258 365 191 427 241 489 149 524 187 576 139 664 254Z" fill="#2c5351" opacity=".7"/>
    <g class="floating-island">
      <path d="m280 246 49 69 57 9 47 43 65-18 47-37 65-66Z" :fill="`url(#${uid}earth)`"/>
      <path d="m330 250 23 56 33 18 4-54m43 97 21-91m44 73-3-65m50 28 25-62" stroke="#385249" stroke-width="2" opacity=".5"/>
      <path d="m271 239 69-28 67 8 80-31 71 26 62 28-40 23-111-9-71 16-75-14Z" fill="#3f7758"/>
      <path d="m271 239 69-28 67 8 80-31 71 26 62 28-20 1-43-18-70-26-80 29-67-7-55 23Z" fill="#76b17e"/>
      <path d="m437 213 25 5-11 40-7 91-18 19-2-102Z" :fill="`url(#${uid}water)`"/>
      <path d="m444 225-6 54-4 50" stroke="#b7ffff" opacity=".6" stroke-width="2"/>
      <g fill="#14352e"><path d="M314 221v-49h9v49Z"/><path d="m318 117-28 52h15l-26 33h80l-27-33h16Z"/><path d="M574 226v-54h8v54Z"/><path d="m578 110-33 59h15l-24 38h85l-29-38h16Z"/></g>
      <g fill="#3d8254"><path d="m351 99-33 56h13l-25 33h90l-28-33h15Z"/><path d="m538 131-27 42h10l-22 31h77l-24-31h11Z"/></g>
      <path d="M347 187h9v47h-9zm187 16h8v20h-8z" fill="#7b7051"/>
      <path d="M388 211v-55h82v55l-35 13Z" fill="#835f40"/><path d="M430 156h40v55l-35 13Z" fill="#5c4935"/>
      <path d="m375 158 55-43 57 43h-17l-39-29-39 29Z" fill="#263c39"/><path d="m375 158 55-43 57 43-7 3-50-35-47 36Z" fill="#99ad7c"/>
      <path d="M404 169h13v17h-13zm39 1h14v16h-14z" fill="#f8ce7a"/><path d="M426 188h14v34l-14-4Z" fill="#342f29"/>
      <path d="M401 174h18m-9-7v22m30-14h20m-10-7v20" stroke="#8d7449" stroke-width="2"/>
      <path d="M453 133v-22h9v27" fill="#5c6250"/><path d="M457 105c-13-15 14-15 3-32" stroke="#aac6ba" stroke-width="5" opacity=".18" class="chimney"/>
      <g fill="#aad68c"><path d="m309 241 1-11 5 8 3-9 2 15zm189-9 1-10 4 6 4-9 2 13zm53 14 2-9 4 6 4-12 1 16z"/></g>
      <g fill="#e7c176"><circle cx="367" cy="228" r="2"/><circle cx="503" cy="216" r="2"/><circle cx="533" cy="244" r="2"/></g>
    </g>
    <path d="m658 282 19-8 24 7-20 25Z" fill="#335549"/><path d="m657 281 20-9 26 8-23 7Z" fill="#6c9870"/>
    <path d="m225 284 18-9 26 8-25 31Z" fill="#29483e"/><path d="m224 283 18-9 28 8-26 9Z" fill="#5c8c61"/>
  </svg>
</template>
