import { reactive } from 'vue';

export const connectionStatus = reactive({ recovering: false });
let timer;
export const beginRecovery = () => {
  clearTimeout(timer);
  timer = setTimeout(() => { connectionStatus.recovering = true; }, 1500);
};
export const finishRecovery = () => {
  clearTimeout(timer);
  connectionStatus.recovering = false;
};
