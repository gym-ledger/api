#!/usr/bin/env bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER workout_gym_api_user WITH PASSWORD '$DATABASE_PASSWORD';
    CREATE DATABASE workout_gym_api_db OWNER workout_gym_api_user;
    GRANT ALL PRIVILEGES ON DATABASE workout_gym_api_db TO workout_gym_api_user;
EOSQL
