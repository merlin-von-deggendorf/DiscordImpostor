import { Game, GameState } from "./entity/Game";


class GameLogic {
    game?: Game;

    startGame(playerID: string) {


    }
    addParticipant(playerID: string) {
        // only if he doesn't exist already
        if(this.game?.state == GameState.Waiting4Players) {
            
        }
    }
    removeParticipant(playerID: string) {
        // only if he exists
    }
    sendWord2AllUsers() {

    }

}