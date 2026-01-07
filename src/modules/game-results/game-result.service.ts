import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class GameResultService {
    private readonly logger = new Logger(GameResultService.name);
    constructor() {}
}