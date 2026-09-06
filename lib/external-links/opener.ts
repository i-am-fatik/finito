export type ExternalLinkOpenerOptions = {
	target: Pick<Document, "addEventListener" | "removeEventListener">;
	open: (url: string) => unknown;
};

const findExternalLink = (
	clicked: EventTarget | null,
): HTMLAnchorElement | null => {
	if (!(clicked instanceof Element)) {
		return null;
	}
	const link = clicked.closest<HTMLAnchorElement>("a");
	if (link === null || link.target !== "_blank") {
		return null;
	}

	return link.getAttribute("href") ? link : null;
};

export const installExternalLinkOpener = (
	options: ExternalLinkOpenerOptions,
): (() => void) => {
	const handleClick = (event: MouseEvent) => {
		if (event.defaultPrevented || event.button !== 0) {
			return;
		}
		const link = findExternalLink(event.target);
		if (link === null) {
			return;
		}
		event.preventDefault();
		options.open(link.href);
	};

	options.target.addEventListener("click", handleClick);

	return () => {
		options.target.removeEventListener("click", handleClick);
	};
};
