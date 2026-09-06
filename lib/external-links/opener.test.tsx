import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { installExternalLinkOpener } from "@/lib/external-links/opener";

const opened: string[] = [];
const uninstallers: Array<() => void> = [];

const listen = () => {
	uninstallers.push(
		installExternalLinkOpener({
			target: document,
			open: (url) => {
				opened.push(url);
			},
		}),
	);
};

const mount = (html: string) => {
	document.body.innerHTML = html;
	listen();
};

const clickOn = (selector: string, init: MouseEventInit = {}): MouseEvent => {
	const element = document.querySelector(selector);
	if (element === null) {
		throw new Error(`nothing matches ${selector}`);
	}
	const event = new MouseEvent("click", {
		bubbles: true,
		cancelable: true,
		button: 0,
		...init,
	});
	element.dispatchEvent(event);

	return event;
};

afterEach(() => {
	for (const uninstall of uninstallers.splice(0)) {
		uninstall();
	}
	cleanup();
	opened.length = 0;
	document.body.innerHTML = "";
});

describe("installExternalLinkOpener", () => {
	it("hands a target=_blank link to the system and stops the webview navigation", () => {
		mount(
			'<a id="link" href="https://example.com/menu" target="_blank">open</a>',
		);

		const event = clickOn("#link");

		expect(opened).toEqual(["https://example.com/menu"]);
		expect(event.defaultPrevented).toBe(true);
	});

	it("keeps a wallet scheme intact", () => {
		mount('<a id="link" href="lightning:lnbc1invoice" target="_blank">pay</a>');

		clickOn("#link");

		expect(opened).toEqual(["lightning:lnbc1invoice"]);
	});

	it("opens when the click lands on something inside the link", () => {
		mount(
			'<a id="link" href="https://example.com/" target="_blank"><svg id="icon"></svg>open</a>',
		);

		clickOn("#icon");

		expect(opened).toEqual(["https://example.com/"]);
	});

	it("leaves an in-app link to the router", () => {
		mount('<a id="link" href="/admin/venue">tables</a>');

		const event = clickOn("#link");

		expect(opened).toEqual([]);
		expect(event.defaultPrevented).toBe(false);
	});

	it("ignores a link that has no href", () => {
		mount('<a id="link" target="_blank">open</a>');

		const event = clickOn("#link");

		expect(opened).toEqual([]);
		expect(event.defaultPrevented).toBe(false);
	});

	it("ignores anything but a primary click", () => {
		mount('<a id="link" href="https://example.com/" target="_blank">open</a>');

		clickOn("#link", { button: 1 });

		expect(opened).toEqual([]);
	});

	it("ignores a click another handler already took", () => {
		mount('<a id="link" href="https://example.com/" target="_blank">open</a>');
		document.querySelector("#link")?.addEventListener("click", (event) => {
			event.preventDefault();
		});

		clickOn("#link");

		expect(opened).toEqual([]);
	});

	it("stops opening links once uninstalled", () => {
		mount('<a id="link" href="https://example.com/" target="_blank">open</a>');

		for (const uninstall of uninstallers.splice(0)) {
			uninstall();
		}
		const event = clickOn("#link");

		expect(opened).toEqual([]);
		expect(event.defaultPrevented).toBe(false);
	});

	it("survives a click dispatched on the document itself", () => {
		const failures: string[] = [];
		const collectFailure = (event: ErrorEvent) => {
			failures.push(event.message);
		};
		window.addEventListener("error", collectFailure);
		mount('<a id="link" href="https://example.com/" target="_blank">open</a>');

		document.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		);
		window.removeEventListener("error", collectFailure);

		expect(failures).toEqual([]);
		expect(opened).toEqual([]);
	});

	it("opens the access url behind the table detail button", () => {
		const accessUrl = "https://example.com/#t-token";
		const { getByRole } = render(
			<Button
				variant="outline"
				size="sm"
				nativeButton={false}
				render={
					<a href={accessUrl} target="_blank" rel="noopener noreferrer">
						open
					</a>
				}
			/>,
		);
		listen();

		fireEvent.click(getByRole("button"));

		expect(opened).toEqual([accessUrl]);
	});
});
