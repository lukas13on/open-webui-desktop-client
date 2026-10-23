import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { config, library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import {
  faArrowRight,
  faArrowRotateRight,
  faArrowUpRightFromSquare,
  faAsterisk,
  faCheck,
  faCircleCheck,
  faCircleInfo,
  faEye,
  faEyeSlash,
  faGear,
  faGlobe,
  faHouse,
  faKey,
  faLanguage,
  faLock,
  faMicrochip,
  faPenToSquare,
  faPlus,
  faRotate,
  faRotateLeft,
  faServer,
  faTrashCan,
  faTriangleExclamation,
  faWandMagicSparkles,
  faWindowMaximize,
  faWindowMinimize,
  faWindowRestore,
  faXmark
} from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import '@fortawesome/fontawesome-svg-core/styles.css';
import App from './App.vue';
import './styles/main.css';

// The stylesheet is imported above; injecting it again would duplicate rules on every render.
config.autoAddCss = false;

library.add(
  faArrowRight,
  faArrowRotateRight,
  faArrowUpRightFromSquare,
  faAsterisk,
  faCheck,
  faCircleCheck,
  faCircleInfo,
  faEye,
  faEyeSlash,
  faGear,
  faGithub,
  faGlobe,
  faHouse,
  faKey,
  faLanguage,
  faLock,
  faMicrochip,
  faPenToSquare,
  faPlus,
  faRotate,
  faRotateLeft,
  faServer,
  faTrashCan,
  faTriangleExclamation,
  faWandMagicSparkles,
  faWindowMaximize,
  faWindowMinimize,
  faWindowRestore,
  faXmark
);

createApp(App).use(createPinia()).component('FontAwesomeIcon', FontAwesomeIcon).mount('#app');
