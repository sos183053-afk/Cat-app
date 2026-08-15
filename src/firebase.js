import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";

// ⚠️ 把下面這些值換成你自己 Firebase 專案的設定
// (Firebase Console -> 專案設定 -> 一般 -> 你的應用程式 -> SDK 設定)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
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
