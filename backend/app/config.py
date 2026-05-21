from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Romarr"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./data/romarr.db"
    data_dir: str = "./data"
    rom_library_path: str = "./library"
    log_level: str = "INFO"

    igdb_client_id: str = ""
    igdb_client_secret: str = ""
    rawg_api_key: str = ""

    @property
    def dat_dir(self) -> Path:
        return Path(self.data_dir) / "dats"

    @property
    def log_dir(self) -> Path:
        return Path(self.data_dir) / "logs"

    class Config:
        env_file = ".env"


settings = Settings()
