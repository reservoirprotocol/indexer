import "reflect-metadata";
import { DataSource } from "typeorm";
import { config } from "@/config/index";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: config.databaseUrl,
  synchronize: true,
  logging: false,
  entities: ["entities/*.js"],
  migrations: [],
  subscribers: [],
});
