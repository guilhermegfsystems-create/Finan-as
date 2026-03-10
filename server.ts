import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const JWT_SECRET = process.env.JWT_SECRET || "gf-systems-secret-key-2024";

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // In-memory state (cached from DB)
  let expenses: any[] = [];
  let agregados: any[] = [];
  let users: any[] = [];

  // Helper to hash passwords if they are not hashed
  const hashPasswordIfNeeded = async (password: string) => {
    if (password.startsWith("$2a$") || password.startsWith("$2b$")) {
      return password;
    }
    return await bcrypt.hash(password, 10);
  };

  // Initial fetch from Supabase
  try {
    const { data: expData, error: expError } = await supabase.from('expenses').select('*');
    if (!expError && expData) expenses = expData;

    const { data: agrData, error: agrError } = await supabase.from('agregados').select('*');
    if (!agrError && agrData) agregados = agrData;

    const { data: userData, error: userError } = await supabase.from('users').select('*');
    if (!userError && userData && userData.length > 0) {
      users = userData;
      // Ensure all passwords are hashed
      let updated = false;
      for (const u of users) {
        const hashed = await hashPasswordIfNeeded(u.pass);
        if (hashed !== u.pass) {
          u.pass = hashed;
          updated = true;
        }
      }
      if (updated) {
        await supabase.from('users').upsert(users);
      }
    } else {
      // Default admin user if none exists
      const hashedPass = await bcrypt.hash('123', 10);
      users = [{ user: 'admin', pass: hashedPass }];
      await supabase.from('users').upsert(users);
    }
    
    console.log("Initial data fetched from Supabase and secured");
  } catch (err) {
    console.error("Error fetching initial data from Supabase:", err);
  }

  // API Routes
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login attempts per window
    message: { success: false, message: "Muitas tentativas de login. Tente novamente mais tarde." }
  });

  app.post("/api/login", loginLimiter, async (req, res) => {
    const { user, pass } = req.body;
    console.log(`Tentativa de login para o usuário: ${user}`);
    const foundUser = users.find(u => u.user === user);
    
    if (foundUser && await bcrypt.compare(pass, foundUser.pass)) {
      console.log(`Login bem-sucedido: ${user}`);
      const token = jwt.sign({ user: foundUser.user }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ success: true, user: foundUser.user, token });
    } else {
      console.warn(`Falha no login: ${user}`);
      res.status(401).json({ success: false, message: "Usuário ou senha inválidos" });
    }
  });

  app.get("/api/verify", (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false });
    
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      res.json({ success: true, user: decoded.user });
    } catch (err) {
      res.status(401).json({ success: false });
    }
  });

  // WebSocket handling
  wss.on("connection", (ws) => {
    console.log("Client connected");

    // Send initial state (sanitize users - remove passwords)
    const sanitizedUsers = users.map(({ pass, ...rest }) => rest);
    ws.send(JSON.stringify({ type: "INIT", expenses, agregados, users: sanitizedUsers }));

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Check for token in messages that update data
        if (message.type.startsWith("UPDATE_")) {
          const token = message.token;
          if (!token) {
            console.warn("Update attempted without token");
            return;
          }
          try {
            jwt.verify(token, JWT_SECRET);
          } catch (err) {
            console.warn("Invalid token in update message");
            return;
          }
        }
        
        switch (message.type) {
          case "UPDATE_EXPENSES":
            expenses = message.payload;
            broadcast({ type: "EXPENSES_UPDATED", payload: expenses }, ws);
            (async () => {
              await supabase.from('expenses').delete().neq('id', -1);
              if (expenses.length > 0) {
                await supabase.from('expenses').upsert(expenses);
              }
            })();
            break;
          case "UPDATE_AGREGADOS":
            agregados = message.payload;
            broadcast({ type: "AGREGADOS_UPDATED", payload: agregados }, ws);
            (async () => {
              await supabase.from('agregados').delete().neq('id', -1);
              if (agregados.length > 0) {
                await supabase.from('agregados').upsert(agregados);
              }
            })();
            break;
          case "UPDATE_USERS":
            // When updating users from client, we need to handle passwords carefully
            // The client only has usernames. If they add a new user, they send a password.
            // We must hash it before saving.
            const newUsers = [];
            for (const u of message.payload) {
              const existing = users.find(ex => ex.user === u.user);
              if (u.pass) {
                // New user or password change
                u.pass = await hashPasswordIfNeeded(u.pass);
              } else if (existing) {
                // Keep existing hashed password
                u.pass = existing.pass;
              }
              newUsers.push(u);
            }
            users = newUsers;
            
            // Broadcast sanitized list
            const sanitized = users.map(({ pass, ...rest }) => rest);
            broadcast({ type: "USERS_UPDATED", payload: sanitized }, ws);
            
            (async () => {
              await supabase.from('users').delete().neq('user', '___non_existent___');
              if (users.length > 0) {
                await supabase.from('users').upsert(users);
              }
            })();
            break;
        }
      } catch (e) {
        console.error("Error parsing message", e);
      }
    });
  });

  function broadcast(message: any, skipWs?: WebSocket) {
    const data = JSON.stringify(message);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client !== skipWs) {
        client.send(data);
      }
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile("dist/index.html", { root: "." });
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
