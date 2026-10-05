<script setup>
import { computed, onMounted, ref } from 'vue';
import AssetCard from '../components/AssetCard.vue';
import Disclaimer from '../components/Disclaimer.vue';
import { api } from '../utils/api.js';
import { usePoll } from '../utils/poll.js';

const items = ref(null);
const error = ref('');

async function load(refresh = false) {
  try {
    const data = await api(refresh ? '/assets?refresh=1' : '/assets');
    items.value = data.items;
    error.value = '';
    if (data.items.some((a) => a.status === 'collecting')) poll.start();
    else poll.stop();
  } catch (e) {
    error.value = e.message;
    poll.stop();
  }
}
const poll = usePoll(() => load(), 1500);

async function retry(id) {
  try {
    await api(`/assets/${id}/collect`, { method: 'POST' });
  } catch (e) {
    error.value = e.message;
  }
  load();
}

const count = computed(() => items.value?.length ?? 0);
onMounted(() => load(true));
</script>

<template>
  <main class="page" data-testid="home">
    <header class="row between">
      <h1 class="title-lg">내 자산</h1>
      <span v-if="items" class="badge" data-testid="asset-count">{{ count }}개</span>
    </header>

    <p v-if="error" class="card body-sm" role="alert">{{ error }}</p>

    <section v-if="items && !count" class="card-cream stack empty" data-testid="empty">
      <h2 class="title-md">아직 등록한 자산이 없어요</h2>
      <p class="body-sm">단지와 동·호를 입력하면 실제 실거래가로 내 자산의 현재 가격을 보여드려요.</p>
    </section>

    <section v-else-if="items" class="stack list">
      <AssetCard v-for="a in items" :key="a.id" :asset="a" @retry="retry" />
    </section>

    <RouterLink to="/add" class="btn btn-primary btn-block" data-testid="add-asset">자산 추가</RouterLink>
  </main>
  <Disclaimer />
</template>

<style scoped>
.list { gap: var(--s-md); }
.empty { gap: var(--s-xs); }
</style>
