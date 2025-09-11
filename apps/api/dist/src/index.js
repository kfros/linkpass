"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;
(0, server_1.buildServer)().then((app) => {
    app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
        console.log(`Server listening on port ${PORT}`);
    });
});
