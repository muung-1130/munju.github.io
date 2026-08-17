---
name: add-api
description: Adds or modifies a DAI RUN REST API. Use when the user requests an endpoint, controller, API specification, request/response DTO, service logic, repository logic, or API test.
argument-hint: "[service] [API description]"
---

# Add or Modify a DAI RUN API

Target request:

$ARGUMENTS

## Required process

1. Identify the owning service.
2. Inspect the existing service structure and similar APIs.
3. Do not query another service's database.
4. Define the API contract before implementation.
5. Implement the smallest complete vertical slice.
6. Add tests and update API documentation.

## API contract

Before coding, determine:

- Service
- HTTP method
- Endpoint
- Authentication
- Authorization role
- Path parameters
- Query parameters
- Request body
- Success response
- Error response
- Idempotency requirement
- Database reads and writes
- Kafka events produced
- Kafka events consumed

## Spring Boot implementation order

When the target is Spring Boot:

1. Request DTO
2. Response DTO
3. Bean Validation
4. Controller
5. Application service or use case
6. Domain logic
7. Repository or external client adapter
8. Exception mapping
9. Unit test
10. Controller or integration test

Do not expose JPA entities through the API.

## FastAPI implementation order

When the target is FastAPI:

1. Pydantic request model
2. Pydantic response model
3. Router
4. Use case or service
5. Port and adapter
6. Timeout and error handling
7. Unit test
8. API test

Long-running inference must use an asynchronous job flow.

## Completion report

Return:

- Final API contract
- Files changed
- Database impact
- Event impact
- Tests executed
- Remaining risks
