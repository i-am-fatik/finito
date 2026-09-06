"use client";

import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import { installExternalLinkOpener } from "@/lib/external-links/opener";

const openOutsideTheApp = (url: string) => {
	void openUrl(url).catch(() => undefined);
};

export const ExternalLinkOpener = () => {
	useEffect(() => {
		if (!isTauri()) {
			return;
		}

		return installExternalLinkOpener({
			target: document,
			open: openOutsideTheApp,
		});
	}, []);

	return null;
};
