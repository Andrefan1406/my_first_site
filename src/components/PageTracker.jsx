import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

export default function PageTracker() {
  const location = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      try {
        await addDoc(collection(db, "page_views"), {
          email: user.email || null,
          uid: user.uid || null,
          page: location.pathname,
          userAgent: navigator.userAgent,
          timestamp: serverTimestamp(),
        });

        console.log("Saved visit:", location.pathname, user.email);
      } catch (error) {
        console.error("PageTracker error:", error);
      }
    });

    return () => unsubscribe();
  }, [location.pathname]);

  return null;
}