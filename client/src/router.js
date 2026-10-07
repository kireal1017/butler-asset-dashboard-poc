import { createRouter, createWebHistory } from 'vue-router';
import Menu from './views/Menu.vue';

// v3 화면 (docs/butler-poc-improvement-spec.md 2.2). 하단 탭 없이 전체 메뉴에서 이동한다.
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'menu', component: Menu },
    { path: '/buildings', name: 'buildings', component: () => import('./views/Buildings.vue') },
    { path: '/buildings/new', name: 'building-new', component: () => import('./views/BuildingForm.vue') },
    { path: '/buildings/:id(\\d+)', name: 'building', component: () => import('./views/BuildingDetail.vue') },
    { path: '/buildings/:id(\\d+)/edit', name: 'building-edit', component: () => import('./views/BuildingForm.vue') },
    { path: '/buildings/:id(\\d+)/units/new', name: 'unit-new', component: () => import('./views/UnitForm.vue') },
    { path: '/units/:id(\\d+)', name: 'unit', component: () => import('./views/UnitDetail.vue') },
    { path: '/units/:id(\\d+)/edit', name: 'unit-edit', component: () => import('./views/UnitForm.vue') },
    { path: '/analysis', name: 'analysis', component: () => import('./views/AnalysisList.vue') },
    { path: '/analysis/:buildingId(\\d+)', name: 'analysis-detail', component: () => import('./views/AnalysisDetail.vue') },
    { path: '/leases', name: 'leases', component: () => import('./views/Leases.vue') },
    { path: '/leases/new', name: 'lease-new', component: () => import('./views/LeaseForm.vue') },
    { path: '/leases/:id(\\d+)/edit', name: 'lease-edit', component: () => import('./views/LeaseForm.vue') },
    { path: '/__swatch', component: () => import('./views/Swatch.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (to, from, saved) => saved ?? (to.path === from.path ? false : { top: 0 }),
});
