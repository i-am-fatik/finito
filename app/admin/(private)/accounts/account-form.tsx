import { SparkWallet } from "@buildonspark/spark-sdk";
import {
	createId,
	createRandomBytes,
	type StandardSchemaV1,
} from "@evolu/common";
import type { SystemColumns } from "@evolu/common/local-first";
import { merge, omit, pick } from "es-toolkit";
import type { TFunction } from "i18next";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { PartialDeep, Simplify } from "type-fest";
import { z } from "zod";
import { AutoForm, createAutoFormLayout } from "@/components/auto-form";
import { useActionForm } from "@/hooks/use-action-form";
import { useEvolu } from "@/hooks/use-evolu";
import type { EvoluSchema } from "@/lib/evolu";
import { TableIdSchema } from "@/lib/evolu/types";
import {
	createGatewayCheck,
	type GatewayProblem,
	type GatewayProblemKind,
	quoteThroughBridge,
} from "@/lib/payment/gateway";
import { UserFacingError } from "@/lib/shared/errors";
import {
	EmailSchema,
	FiatCurrency,
	HttpsUrlSchema,
	IbanSchema,
	NonEmptyString255,
	NonEmptyString255Schema,
	NwcCredentialsSchema,
	StringToNullableStringSchema,
	StringToUndefinedStringSchema,
} from "@/lib/shared/types";
import { assertNever } from "@/lib/shared/utils/type";

const baseAccountSparkSchema = z.object({
	mnemonic: z.string(),
	mnemonicVariant: z.enum(["manual", "new"]),
});

const baseAccountSchema = z.object({
	id: TableIdSchema,
	deviceId: TableIdSchema.nullable(),
	name: StringToNullableStringSchema.pipe(NonEmptyString255Schema),
	accountIban: z.object({
		iban: z.string(),
		currency: z.enum(FiatCurrency).nullable(),
	}),
	accountLud16: z.object({
		lud16: z.string(),
		gatewayUrl: z.string(),
		gatewayToken: z.string(),
	}),
	accountThunderBridge: z.object({
		gatewayUrl: z.string(),
		gatewayToken: z.string(),
		lud16: z.string(),
		iban: z.string(),
		fioReadToken: z.string(),
	}),
	accountSpark: z.object({
		mnemonic: z.string(),
		mnemonicVariant: z.enum(["manual", "new"]),
	}),
	accountNwc: z.object({
		credentials: z.string(),
	}),
	accountCashRegister: z.object({
		currency: z.enum(FiatCurrency).nullable(),
	}),
});

const accountSchema = z.discriminatedUnion("_tag", [
	baseAccountSchema.extend({
		_tag: z.literal("accountIban"),
		accountIban: z.object({
			iban: StringToUndefinedStringSchema.transform((value) =>
				value ? value.replace(/ /g, "") : value,
			).pipe(IbanSchema),
			currency: z.enum(FiatCurrency).nullable().pipe(z.enum(FiatCurrency)),
		}),
	}),
	baseAccountSchema.extend({
		_tag: z.literal("accountLud16"),
		accountLud16: z.object({
			lud16: StringToNullableStringSchema.pipe(EmailSchema),
			gatewayUrl: StringToNullableStringSchema.pipe(HttpsUrlSchema.nullable()),
			gatewayToken: StringToNullableStringSchema.pipe(
				NonEmptyString255Schema.nullable(),
			),
		}),
	}),
	baseAccountSchema
		.extend({
			_tag: z.literal("accountThunderBridge"),
			accountThunderBridge: z.object({
				gatewayUrl: StringToNullableStringSchema.pipe(HttpsUrlSchema),
				gatewayToken: StringToNullableStringSchema.pipe(
					NonEmptyString255Schema.nullable(),
				),
				lud16: StringToNullableStringSchema.pipe(EmailSchema.nullable()),
				iban: StringToNullableStringSchema.transform((value) =>
					value === null ? null : value.replace(/ /g, ""),
				).pipe(IbanSchema.nullable()),
				fioReadToken: StringToNullableStringSchema.pipe(
					NonEmptyString255Schema.nullable(),
				),
			}),
		})
		.check((ctx) => {
			if (
				ctx.value.accountThunderBridge.lud16 === null &&
				ctx.value.accountThunderBridge.iban === null
			) {
				ctx.issues.push({
					code: "custom",
					input: ctx.value,
					message: "Give the gateway a lightning address or an IBAN to serve.",
					path: ["accountThunderBridge", "lud16"],
				});
			}
		}),
	baseAccountSchema.extend({
		_tag: z.literal("accountSpark"),
		accountSpark: z.discriminatedUnion("mnemonicVariant", [
			baseAccountSparkSchema.extend({
				mnemonicVariant: z.literal("manual"),
				mnemonic: StringToNullableStringSchema.pipe(NonEmptyString255Schema),
			}),
			baseAccountSparkSchema.extend({
				mnemonicVariant: z.literal("new"),
			}),
		]),
	}),
	baseAccountSchema.extend({
		_tag: z.literal("accountNwc"),
		accountNwc: z.object({
			credentials: StringToNullableStringSchema.pipe(NwcCredentialsSchema),
		}),
	}),
	baseAccountSchema.extend({
		_tag: z.literal("accountCashRegister"),
		accountCashRegister: z.object({
			currency: z.enum(FiatCurrency).nullable().pipe(z.enum(FiatCurrency)),
		}),
	}),
]);

const checkGateway = createGatewayCheck({ quote: quoteThroughBridge });

const gatewayProblemKeys = {
	unauthorized: "accounts:form.account-form.gateway.unauthorized",
	unreachable: "accounts:form.account-form.gateway.unreachable",
	noWallet: "accounts:form.account-form.gateway.noWallet",
	refused: "accounts:form.account-form.gateway.refused",
	unknown: "accounts:form.account-form.gateway.unknown",
} as const satisfies Record<GatewayProblemKind, string>;

const describeGatewayRefusal = (t: TFunction, problem: GatewayProblem) =>
	t(gatewayProblemKeys[problem.kind], {
		status: problem.status ?? "",
		detail: problem.detail ?? "",
	});

const createIdDeps = {
	randomBytes: createRandomBytes(),
};

const createItemDefaultValues = () =>
	({
		id: createId(createIdDeps),
		deviceId: null,
		name: "",
		_tag: "accountIban",
		accountIban: {
			iban: "",
			currency: null,
		},
		accountLud16: {
			lud16: "",
			gatewayUrl: "",
			gatewayToken: "",
		},
		accountThunderBridge: {
			gatewayUrl: "",
			gatewayToken: "",
			lud16: "",
			iban: "",
			fioReadToken: "",
		},
		accountSpark: {
			mnemonicVariant: "new",
			mnemonic: "",
		},
		accountNwc: {
			credentials: "",
		},
		accountCashRegister: {
			currency: null,
		},
	}) satisfies z.input<typeof accountSchema>;

const tagKeys = [
	"accountIban",
	"accountLud16",
	"accountNwc",
	"accountSpark",
	"accountThunderBridge",
	"accountCashRegister",
] as const;

const createComponents = (
	t: TFunction,
	options: { tagFilter?: (typeof tagKeys)[number][] } = {},
) =>
	createAutoFormLayout(accountSchema, ({ builder }) => ({
		...builder.magicInput("id").hidden(undefined),
		...builder.magicInput("deviceId").hidden(undefined),
		...builder.magicInput("name").text({
			label: t("accounts:form.account-form.label.name"),
		}),
		...builder.magicInput("_tag").select({
			label: t("accounts:form.account-form.label.protocol"),
			variant: "toggle",
			allowEmpty: false,
			values: pick(
				{
					accountIban: t("accounts:form.account-form.tag.account-iban"),
					accountLud16: t("accounts:form.account-form.tag.account-lud16"),
					accountNwc: t("accounts:form.account-form.tag.account-nwc"),
					accountSpark: t("accounts:form.account-form.tag.account-spark"),
					accountThunderBridge: t(
						"accounts:form.account-form.tag.account-thunder-bridge",
					),
					accountCashRegister: t(
						"accounts:form.account-form.tag.account-cash-register",
					),
				},
				options.tagFilter ?? [...tagKeys],
			),
		}),

		...builder.nestedField("accountIban", ({ builder }) => ({
			...builder.when("_tag", "accountIban", {
				...builder.magicInput("iban").text({
					label: t("accounts:form.account-form.label.iban"),
				}),
				...builder.magicInput("currency").select({
					values: FiatCurrency,
					allowEmpty: false,
					label: t("accounts:form.account-form.label.currency"),
				}),
			}),
		})),

		...builder.nestedField("accountLud16", ({ builder }) => ({
			...builder.when("_tag", "accountLud16", {
				...builder.magicInput("lud16").text({
					label: t("accounts:form.account-form.label.lud16"),
				}),
				...builder.magicInput("gatewayUrl").text({
					label: t("accounts:form.account-form.label.gateway-url"),
				}),
				...builder.magicInput("gatewayToken").text({
					label: t("accounts:form.account-form.label.gateway-token"),
					secretContent: true,
				}),
			}),
		})),

		...builder.nestedField("accountThunderBridge", ({ builder }) => ({
			...builder.when("_tag", "accountThunderBridge", {
				...builder.magicInput("gatewayUrl").text({
					label: t("accounts:form.account-form.label.gateway-url"),
				}),
				...builder.magicInput("gatewayToken").text({
					label: t("accounts:form.account-form.label.gateway-token"),
					secretContent: true,
				}),
				...builder.magicInput("lud16").text({
					label: t("accounts:form.account-form.label.lud16"),
				}),
				...builder.magicInput("iban").text({
					label: t("accounts:form.account-form.label.iban"),
				}),
				...builder.magicInput("fioReadToken").text({
					label: t("accounts:form.account-form.label.fio-read-token"),
					secretContent: true,
				}),
			}),
		})),

		...builder.nestedField("accountNwc", ({ builder }) => ({
			...builder.when("_tag", "accountNwc", {
				...builder.magicInput("credentials").textarea({
					label: t("accounts:form.account-form.label.credentials"),
					rows: 5,
					secretContent: true,
				}),
			}),
		})),

		...builder.nestedField("accountSpark", ({ builder }) => ({
			...builder.when("_tag", "accountSpark", {
				...builder.magicInput("mnemonicVariant").select({
					label: t("accounts:form.account-form.label.seed"),
					allowEmpty: false,
					values: {
						new: t("accounts:form.account-form.seed-option.new"),
						manual: t("accounts:form.account-form.seed-option.manual"),
					},
				}),
				...builder.when("accountSpark.mnemonicVariant", "manual", {
					...builder.magicInput("mnemonic").textarea({
						label: t("accounts:form.account-form.label.mnemonic"),
						copyToClipboard: true,
						secretContent: true,
						rows: 4,
					}),
				}),
			}),
		})),

		...builder.nestedField("accountCashRegister", ({ builder }) => ({
			...builder.when("_tag", "accountCashRegister", {
				...builder.magicInput("currency").select({
					values: FiatCurrency,
					allowEmpty: false,
					label: t("accounts:form.account-form.label.currency"),
				}),
			}),
		})),
	}));

export const AccountForm: React.FC<{
	defaultValues?: PartialDeep<z.input<typeof accountSchema>>;
	onSuccess?: (newEventId: string) => unknown;
	tagFilter?: (typeof tagKeys)[number][];
}> = (params) => {
	const { t } = useTranslation();
	const [defaultValues] = useState(() => {
		return merge(createItemDefaultValues(), params.defaultValues ?? {});
	});
	const evolu = useEvolu();
	const components = useMemo(
		() => createComponents(t, { tagFilter: params.tagFilter }),
		[params.tagFilter, t],
	);
	const form = useActionForm(accountSchema, {
		defaultValues,
		saveAction: async (values) => {
			const upserts: {
				[key in keyof EvoluSchema]?: Simplify<
					Omit<
						{
							[key2 in keyof EvoluSchema[key]]: StandardSchemaV1.InferOutput<
								// @ts-expect-error
								EvoluSchema[key][key2]
							>;
						},
						keyof SystemColumns | "id"
					>
				>;
			} = {};
			if (values._tag === "accountIban") {
				upserts.accountIban = {
					iban: values.accountIban.iban,
					currency: values.accountIban.currency,
				};
			} else if (values._tag === "accountLud16") {
				upserts.accountLud16 = {
					lud16: values.accountLud16.lud16,
					gatewayUrl: values.accountLud16.gatewayUrl,
					gatewayToken: values.accountLud16.gatewayToken,
				};
			} else if (values._tag === "accountThunderBridge") {
				const bridge = values.accountThunderBridge;

				if (bridge.lud16 !== null) {
					const check = await checkGateway({
						gatewayUrl: bridge.gatewayUrl,
						gatewayToken: bridge.gatewayToken,
						lud16: bridge.lud16,
					});

					if (!check.ok) {
						throw new UserFacingError(describeGatewayRefusal(t, check.problem));
					}

					toast.success(
						t("accounts:form.account-form.gateway.ok", {
							address: check.lnAddress,
						}),
					);
				}

				upserts.accountThunderBridge = {
					gatewayUrl: bridge.gatewayUrl,
					gatewayToken: bridge.gatewayToken,
					lud16: bridge.lud16,
					iban: bridge.iban,
					fioReadToken: bridge.fioReadToken,
				};
			} else if (values._tag === "accountNwc") {
				upserts.accountNwc = {
					credentials: values.accountNwc.credentials,
				};
			} else if (values._tag === "accountSpark") {
				const mnemonic =
					values.accountSpark.mnemonicVariant === "manual"
						? values.accountSpark.mnemonic
						: (
								await SparkWallet.initialize({
									options: { network: "MAINNET" },
								})
							).mnemonic;

				if (!mnemonic) {
					throw new Error("Unexpected mnemonic value");
				}

				upserts.accountSpark = {
					mnemonic: NonEmptyString255(mnemonic),
				};
			} else if (values._tag === "accountCashRegister") {
				upserts.accountCashRegister = {
					currency: values.accountCashRegister.currency,
				};
			} else {
				assertNever(values);
			}

			const createIdDeps = {
				randomBytes: createRandomBytes(),
			};
			const id = values.id ?? createId(createIdDeps);
			const valuesCopy = omit(values, [
				"accountIban",
				"accountLud16",
				"accountNwc",
				"accountSpark",
				"accountThunderBridge",
				"accountCashRegister",
			]);

			evolu.upsert(
				"account",
				{
					...valuesCopy,
					id,
				},
				{
					onComplete: () => {
						if (params.onSuccess) {
							params.onSuccess(id);
						}
					},
				},
			);

			for (const [key, values] of Object.entries(upserts)) {
				evolu.upsert(key as keyof EvoluSchema, {
					id,
					...values,
				});
			}
		},
	});

	useEffect(() => {
		form.form.setFocus("name");
	}, [form.form]);

	return <AutoForm form={form} components={components} />;
};
