import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getDatabase, ref, set, onValue, onDisconnect, remove, update, push, get } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCYqXADT96Ag6sxR82-5dBl1_3GaZRt_68",
  authDomain: "fors-7ee2c.firebaseapp.com",
  databaseURL: "https://fors-7ee2c-default-rtdb.firebaseio.com",
  projectId: "fors-7ee2c",
  storageBucket: "fors-7ee2c.firebasestorage.app",
  messagingSenderId: "980730651454",
  appId: "1:980730651454:web:97dce0fd4b5959eaaa826f",
  measurementId: "G-KWKKQ473PP"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

window.firebaseDB = database;
window.firebaseRef = ref;
window.firebaseSet = set;
window.firebaseOnValue = onValue;
window.firebaseOnDisconnect = onDisconnect;
window.firebaseRemove = remove;
window.firebaseUpdate = update;
window.firebasePush = push;
window.firebaseGet = get;
