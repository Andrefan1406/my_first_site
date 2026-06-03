import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA3kfn3DLMkZOpmgWlBy6WIoyq0ydMv7cM",
  authDomain: "my-first-site-16a0c.firebaseapp.com",
  projectId: "my-first-site-16a0c",
  storageBucket: "my-first-site-16a0c.firebasestorage.app",
  messagingSenderId: "801491416627",
  appId: "1:801491416627:web:e523bbfdb175275c131546",
  measurementId: "G-0Q4X0L6172"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);