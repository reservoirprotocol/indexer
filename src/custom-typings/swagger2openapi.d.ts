type Swagger2OpenAPIOptions = Data;
type ConvertedOpenApi = {
  openapi: Data;
};

declare module "swagger2openapi" {
  export function convertObj(
    data: Data,
    options: Swagger2OpenAPIOptions,
    callback?: (err: Error, options: ConvertedOpenApi) => void
  ): Promise<Data>;
}
