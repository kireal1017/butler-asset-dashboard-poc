import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import './styles/base.css';
import './styles/tokens-v3.css';

createApp(App).use(router).mount('#app');
