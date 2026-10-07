import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { loadDb, saveDb } from "@/lib/db";
import { seedDatabase } from "@/lib/seed";

async function bootstrap() {
  const db = loadDb();
  if (db.users.length === 0) {
    await seedDatabase(db);
    saveDb(db);
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
