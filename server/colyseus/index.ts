import { Server } from 'colyseus';
import { LocationRoom } from './LocationRoom.js';

const port = Number(process.env.COLYSEUS_PORT || 2567);

const gameServer = new Server();

gameServer
  .define('location', LocationRoom)
  .filterBy(['locationName']);

gameServer.listen(port).then(() => {
  console.log(`Colyseus server listening on ws://localhost:${port}`);
});
