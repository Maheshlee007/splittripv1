import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

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

const useFirestoreEmulator =
  import.meta.env.DEV &&
  (import.meta.env.VITE_USE_FIREBASE_EMULATOR ?? "true") !== "false";

if (useFirestoreEmulator) {
  const host = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1";
  const port = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT ?? "8080");
  try {
    connectFirestoreEmulator(db, host, port);
  } catch {
    // Ignore repeated emulator binding during hot reload.
  }
}
