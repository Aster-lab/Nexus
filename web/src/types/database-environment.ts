export interface DatabaseEnvironment {
    [key:string] : string | undefined;
    DATABASE_ENV? :string;
    DATABASE_URL? : string,
    DATABASE_URL_SHA256? : string;
}