import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCtNwkWQxiat8usjKyNLxRFAUJ2kuZ_8vs",
  authDomain: "splittrip-p2p.firebaseapp.com",
  projectId: "splittrip-p2p",
  storageBucket: "splittrip-p2p.firebasestorage.app",
  messagingSenderId: "234764510896",
  appId: "1:234764510896:web:ac43372bc873f3a39e3d75"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
