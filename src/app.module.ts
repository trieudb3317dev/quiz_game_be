import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { databaseConfig } from './config/database.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { appConfig } from './config/app.config';
import { SharedModule } from './shared/shared.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { SubjectModule } from './modules/subjects/subject.module';
import { QuizModule } from './modules/quizzes/quiz.module';
import { RoomModule } from './modules/rooms/room.module';
import { GameResultModule } from './modules/game-results/game-result.module';
import { JoinRoomModule } from './modules/join-rooms/join-room.module';
import { WebsocketModule } from './modules/websockets/websocket.module';
import { AnswerSelectModule } from './modules/ans-selects/ans-select.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env'}),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => databaseConfig(configService),
      inject: [ConfigService],
    }),
    SharedModule,
    AuthModule,
    AdminModule,
    SubjectModule,
    QuizModule,
    RoomModule,
    GameResultModule,
    JoinRoomModule,
    WebsocketModule,
    AnswerSelectModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    appConfig(consumer);
  }
}
