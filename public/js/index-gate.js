import { waitForAuth } from './firebase.js';

const params = new URLSearchParams(window.location.search);
const allowLanding = params.get('view') === 'landing';

const hasStartScreen = !!document.getElementById('start-screen');

if (!allowLanding && !hasStartScreen) {
  const cachedUser = localStorage.getItem('elara_user_cache');
  if (cachedUser) {
    window.location.replace('posts.html');
  } else {
    waitForAuth().then((user) => {
      if (user) window.location.replace('posts.html');
    }).catch(() => {});
  }
}
