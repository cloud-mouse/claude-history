import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/variables.css';
import './styles/global.css';

// Tag the OS platform on <html> early so platform-specific CSS (macOS vibrancy)
// applies before first paint. Read synchronously from the preload-exposed API.
if (window.electronAPI && window.electronAPI.platform) {
  document.documentElement.setAttribute('data-platform', window.electronAPI.platform);
}

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
