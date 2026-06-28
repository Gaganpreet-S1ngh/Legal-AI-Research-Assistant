import { ClassConstructor, plainToClass } from "class-transformer";
import { ValidationError, validate } from "class-validator";

const validationError = async (
  input: any
): Promise<ValidationError[] | false> => {
  const errors = await validate(input, {
    validationError: { target: true },
  });

  if (errors.length) {
    return errors;
  }

  return false;
};

export const RequestValidator = async <T>(
  type: ClassConstructor<T>,
  body: any
): Promise<{ errors: boolean | string; input: T }> => {
  const input = plainToClass(type, body);

  const errors = await validationError(input);
  if (errors) {
    const errorMessage = errors
      .map((error: ValidationError) =>
        (Object as any).values(error.constraints)
      )
      .join(", ");
    return { errors: errorMessage, input };
  }

  return { errors: false, input };
};

export const ArrayRequestValidator = async <T>(
  type: ClassConstructor<T>,
  body: any[]
): Promise<{
  errors: false | { message: string; errors: string; input: T }[];
  input: T[];
}> => {
  const input: T[] = [];
  const _errors: {
    message: string;
    errors: string;
    input: T;
  }[] = [];

  for (let i = 0; i < body.length; i++) {
    const item = plainToClass(type, body[i]);
    input.push(item);

    const errors = await validationError(item);
    if (errors) {
      const errorMessage = errors
        .map((error: ValidationError) =>
          error.constraints ? Object.values(error.constraints) : []
        )
        .flat()
        .join(", ");

      _errors.push({
        message: `Error at index ${i}`,
        errors: errorMessage,
        input: item,
      });
    }
  }

  if (_errors.length > 0) {
    return { errors: _errors, input };
  }

  return { errors: false, input };
};
