import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD6c-22uWdGYnF2S6PPzFiD9Pasi5vyskQ",
  authDomain: "cat-app-d581d.firebaseapp.com",
  projectId: "cat-app-d581d",
  storageBucket: "cat-app-d581d.firebasestorage.app",
  messagingSenderId: "980855107016",
  appId: "1:980855107016:web:aa5aecb604a0200aeca4fd",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// 所有資料都存在 collection "shared" 底下的固定文件，方便多人即時同步
export function watchList(docName, onData, fallback = []) {
  const ref = doc(db, "shared", docName);
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? snap.data().list ?? fallback : fallback),
    (err) => {
      console.error("Firestore watch error:", err);
      onData(fallback);
    }
  );
}

export async function saveList(docName, list) {
  const ref = doc(db, "shared", docName);
  await setDoc(ref, { list });
}
