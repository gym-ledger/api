#!/usr/bin/env bash
set -e

# The password goes in as a psql variable (:'pw' quotes it as a literal), so a
# password containing a quote can't break or change the SQL.
psql -v ON_ERROR_STOP=1 -v pw="$DATABASE_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
    CREATE USER workout_gym_api_user WITH PASSWORD :'pw';
    CREATE DATABASE workout_gym_api_db OWNER workout_gym_api_user;
    GRANT ALL PRIVILEGES ON DATABASE workout_gym_api_db TO workout_gym_api_user;
EOSQL
