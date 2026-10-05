import { createRouter, createWebHistory } from 'vue-router';
import Home from './views/Home.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/add', component: () => import('./views/AddAsset.vue') },
    { path: '/assets/:id', component: () => import('./views/AssetDetail.vue') },
    { path: '/assets/:id/purchase', component: () => import('./views/PurchaseConfirm.vue') },
    { path: '/__swatch', component: () => import('./views/Swatch.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
