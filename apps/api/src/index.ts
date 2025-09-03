import { buildServer } from "./server";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

buildServer().then((app) => {
  app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
    console.log(`Server listening on port ${PORT}`);
  });
});