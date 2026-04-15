// server.js
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));

const players = {}; // id -> {pos:[x,y,z], yaw, pitch, hp}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

io.on("connection", (socket) => {
  players[socket.id] = {
    pos: [0, 1.7, 6],
    yaw: 0,
    pitch: 0,
    hp: 100
  };

  socket.on("move", (data) => {
    const p = players[socket.id];
    if(!p) return;

    // basic sanity clamps (not real anti-cheat)
    const pos = data.pos || p.pos;
    p.pos = [
      clamp(pos[0], -29, 29),
      clamp(pos[1],  1.7, 10),
      clamp(pos[2], -29, 29),
    ];
    p.yaw = +data.yaw || 0;
    p.pitch = clamp(+data.pitch || 0, -1.45, 1.45);
    p.hp = clamp(+data.hp || p.hp, 0, 100);
  });

  socket.on("shoot", ({ targetId }) => {
    if(!targetId) return;
    const attacker = players[socket.id];
    const target = players[targetId];
    if(!attacker || !target) return;
    if(attacker.hp <= 0 || target.hp <= 0) return;

    // Apply damage (server-authoritative-ish)
    target.hp = clamp(target.hp - 20, 0, 100);

    // notify everyone (so hit markers etc. can work)
    io.emit("hit", { targetId, hp: target.hp });

    if(target.hp <= 0){
      // respawn after short delay
      setTimeout(() => {
        if(!players[targetId]) return;
        players[targetId].hp = 100;
        players[targetId].pos = [
          (Math.random()*2-1)*18,
          1.7,
          (Math.random()*2-1)*18
        ];
        io.emit("respawn", { id: targetId, pos: players[targetId].pos, hp: 100 });
      }, 900);
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

// broadcast snapshot
setInterval(() => {
  io.emit("state", { players });
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));