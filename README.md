<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Cấu trúc thư mục (Project structure)

Dưới đây là mô tả ngắn gọn cấu trúc thư mục chính của dự án (phiên bản rút gọn):

- `src/` - Mã nguồn TypeScript của ứng dụng NestJS.
  - `config/` - Cấu hình ứng dụng (ví dụ: `app.config.ts`, `database.config.ts`).
  - `exceptions/` - Bộ lọc lỗi và xử lý ngoại lệ tùy chỉnh (ví dụ: `database-exception.filter.ts`).
  - `middleware/` - Middleware dùng chung (ví dụ: logger, rate limiter).
  - `modules/` - Các module chức năng theo miền (domain):
    - `admin/` - Quản trị (controller, dto, entity, guard, service, strategy).
    - `auth/` - Xác thực (controller, dto, guard, service, strategy).
    - `games/` - (thư mục cho chức năng game, triển khai bên trong).
    - `join-rooms/` - Chức năng tham gia phòng (controller, dto, entity, service).
    - `quizzes/` - Quản lý quiz (controller, dto, entity, service).
    - `rooms/` - Quản lý phòng chơi.
    - `sessions/` - Phiên chơi / session.
    - `subjects/` - Chủ đề và các thực thể liên quan (ví dụ: `subject.entity.ts`, `sub-subject.entity.ts`).
    - `users/` - Thực thể người dùng.
  - `shared/` - Mã dùng chung giữa các module (module chung, providers, cache, cloudinary, mail, ...).
  - `utils/` - Các tiện ích (ví dụ: `slugify.ts`, `parseLine.ts`).

- Top-level files:
  - `package.json` - Quản lý phụ thuộc và script chạy (yarn/npm).
  - `tsconfig.json` / `tsconfig.build.json` - Cấu hình TypeScript.
  - `Dockerfile` - Docker image build (nếu có).
  - `create-db.js` - Script tạo DB (nếu dự án sử dụng script này).
  - `.env` / `.env.example` - Biến môi trường (không commit file `.env` thực tế vào git).

Gợi ý ngắn: README này giữ phần giới thiệu mặc định của Nest; phần "Cấu trúc thư mục" ở trên giúp các cộng tác viên mới nhanh nắm repo. Nếu bạn muốn, mình có thể mở rộng mô tả cho từng module (ví dụ liệt kê endpoint cơ bản, entity chính, hoặc sơ đồ ER cho database).
