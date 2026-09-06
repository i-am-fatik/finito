import { type Id, sqliteTrue } from "@evolu/common";
import type { TFunction } from "i18next";
import { useAtomValue } from "jotai";
import type React from "react";
import { useEffect, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { accountAtom } from "@/atoms/account";
import {
	AutoForm,
	type AutoFormComponent,
	createAutoFormLayout,
} from "@/components/auto-form";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "@/components/ui/field";
import { useActionForm } from "@/hooks/use-action-form";
import { useEvolu } from "@/hooks/use-evolu";
import { AiAgentScope } from "@/lib/evolu/model/ai-agent";
import { scopeLabelKeys } from "@/lib/mcp/scope-labels";
import { createAgentToken, hashAgentToken } from "@/lib/mcp/token";
import {
	NonEmptyString,
	NonEmptyString255Schema,
	StringToNullableStringSchema,
} from "@/lib/shared/types";

const scopeFields = [
	["catalogRead", AiAgentScope.CatalogRead],
	["catalogWrite", AiAgentScope.CatalogWrite],
	["posRead", AiAgentScope.PosRead],
	["posWrite", AiAgentScope.PosWrite],
	["paymentsRead", AiAgentScope.PaymentsRead],
	["paymentsWrite", AiAgentScope.PaymentsWrite],
	["contactsRead", AiAgentScope.ContactsRead],
	["settingsWrite", AiAgentScope.SettingsWrite],
] as const;

const scopeFieldNames = scopeFields.map(([field]) => field);

export const mcpAgentFormSchema = z.object({
	label: StringToNullableStringSchema.pipe(NonEmptyString255Schema),
	allowAll: z.boolean(),
	catalogRead: z.boolean(),
	catalogWrite: z.boolean(),
	posRead: z.boolean(),
	posWrite: z.boolean(),
	paymentsRead: z.boolean(),
	paymentsWrite: z.boolean(),
	contactsRead: z.boolean(),
	settingsWrite: z.boolean(),
});

type McpAgentFormValues = z.input<typeof mcpAgentFormSchema>;

export type EditableAgent = {
	id: Id;
	label: string;
	scopes: ReadonlyArray<{ id: Id; scope: AiAgentScope }>;
};

const createDefaultValues = (agent?: EditableAgent): McpAgentFormValues => {
	const granted = new Set(agent?.scopes.map((row) => row.scope) ?? []);

	return {
		label: agent?.label ?? "",
		allowAll: granted.size === scopeFields.length,
		...Object.fromEntries(
			scopeFields.map(([field, scope]) => [field, granted.has(scope)]),
		),
	} as McpAgentFormValues;
};

const AllowAllScopesInput: AutoFormComponent<boolean> = (props) => {
	const { t } = useTranslation();
	const { setValue } = useFormContext();
	const granted = useWatch({ control: props.control, name: scopeFieldNames });
	const allGranted = granted.every((value) => value === true);

	return (
		<Field orientation="horizontal">
			<Checkbox
				id={props.name}
				checked={allGranted}
				onCheckedChange={(value) => {
					const nextValue = value === true;
					setValue(props.name, nextValue);
					for (const field of scopeFieldNames) {
						setValue(field, nextValue, { shouldDirty: true });
					}
				}}
			/>
			<FieldContent>
				<FieldLabel htmlFor={props.name}>
					{t("settings:form.mcp-agent-form.label.allow-all")}
				</FieldLabel>
				<FieldDescription>
					{t("settings:form.mcp-agent-form.description.allow-all")}
				</FieldDescription>
			</FieldContent>
		</Field>
	);
};

const createComponents = (t: TFunction) =>
	createAutoFormLayout(mcpAgentFormSchema, ({ builder }) => ({
		...builder.magicInput("label").text({
			label: t("settings:form.mcp-agent-form.label.label"),
			description: t("settings:form.mcp-agent-form.description.label"),
		}),
		...builder.card(
			{
				title: t("settings:form.mcp-agent-form.title.scopes"),
				variant: "transparent",
			},
			{
				...builder.createComponent("allowAll", AllowAllScopesInput),
				...Object.assign(
					{},
					...scopeFields.map(([field, scope]) =>
						builder
							.magicInput(field)
							.checkbox({ label: t(scopeLabelKeys[scope]) }),
					),
				),
			},
		),
	}));

export type CreatedAgent = { label: string; token: string };

export const McpAgentForm: React.FC<{
	agent?: EditableAgent;
	onCreated?: (agent: CreatedAgent) => void;
	onSaved?: () => void;
}> = (props) => {
	const { t } = useTranslation();
	const evolu = useEvolu();
	const account = useAtomValue(accountAtom);
	const components = useMemo(() => createComponents(t), [t]);
	const editedAgent = props.agent;
	const form = useActionForm(mcpAgentFormSchema, {
		defaultValues: () => createDefaultValues(editedAgent),
		saveAction: async (values) => {
			const granted = new Set(
				scopeFields
					.filter(([field]) => values[field])
					.map(([, scope]) => scope),
			);

			if (editedAgent !== undefined) {
				evolu.update("aiAgent", {
					id: editedAgent.id,
					label: values.label,
				});
				const grantIds = new Map(
					editedAgent.scopes.map((row) => [row.scope, row.id]),
				);
				for (const [, scope] of scopeFields) {
					const grantId = grantIds.get(scope);
					if (granted.has(scope) && grantId === undefined) {
						evolu.insert("aiAgentScope", {
							aiAgentId: editedAgent.id,
							scope,
						});
					}
					if (!granted.has(scope) && grantId !== undefined) {
						evolu.update("aiAgentScope", {
							id: grantId,
							isDeleted: sqliteTrue,
						});
					}
				}
				props.onSaved?.();
				return;
			}

			const token = createAgentToken();
			const { id } = evolu.insert("aiAgent", {
				deviceId: account.device.id,
				label: values.label,
				tokenHash: NonEmptyString(hashAgentToken(token)),
				lastUsedAt: null,
			});
			for (const scope of granted) {
				evolu.insert("aiAgentScope", { aiAgentId: id, scope });
			}
			props.onCreated?.({ label: values.label, token });
		},
	});
	const { reset, formState } = form.form;

	useEffect(() => {
		if (formState.isSubmitSuccessful && editedAgent === undefined) {
			reset(createDefaultValues());
		}
	}, [formState.isSubmitSuccessful, reset, editedAgent]);

	return <AutoForm form={form} components={components} />;
};
