import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export type TestDatabase = {
  container: StartedPostgreSqlContainer;
  connectionString: string;
};

export async function startPostgres(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('warehouse_manager_test')
    .withUsername('warehouse_test')
    .withPassword('test-only')
    .start();

  return { container, connectionString: container.getConnectionUri() };
}
