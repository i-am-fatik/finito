import { isTauri } from "@tauri-apps/api/core";

export const clientBaseUrl = isTauri()
	? `https://finitoapp.netlify.app`
	: `${window.location.protocol}//${window.location.host}`;
