export class UserFacingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UserFacingError";
	}
}

export const readUserFacingMessage = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	"name" in error &&
	(error as { name: unknown }).name === "UserFacingError" &&
	"message" in error &&
	typeof (error as { message: unknown }).message === "string" &&
	(error as { message: string }).message.length > 0
		? (error as { message: string }).message
		: null;
