import {randomUUID} from "crypto";

const TEST_PREFIX = "nexus-test";

export function createTestId():string {
    return `${TEST_PREFIX}-${randomUUID()}`;
}

export function createTestEmail():string{
    return `${createTestId()}@example.test`;
}