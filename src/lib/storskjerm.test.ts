import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isApple,
  isChromium,
  isIOSLike,
  supportsWindowPlacement,
} from "@/lib/client/storskjerm/detect";
import { erTavleSok, tavleUrl } from "@/lib/client/storskjerm/usePresentasjon";

const UA = {
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
  winChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  winEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  chromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
};

describe("detect", () => {
  const rader: [string, string, number, { apple: boolean; ios: boolean; chromium: boolean }][] = [
    ["macSafari", UA.macSafari, 0, { apple: true, ios: false, chromium: false }],
    ["macChrome", UA.macChrome, 0, { apple: true, ios: false, chromium: true }],
    ["ipadOS desktop UA + touch", UA.ipadDesktop, 5, { apple: true, ios: true, chromium: false }],
    ["iphone Safari", UA.iphoneSafari, 5, { apple: true, ios: true, chromium: false }],
    ["iOS Chrome (CriOS)", UA.iosChrome, 5, { apple: true, ios: true, chromium: false }],
    ["Windows Chrome", UA.winChrome, 0, { apple: false, ios: false, chromium: true }],
    ["Edge", UA.winEdge, 0, { apple: false, ios: false, chromium: true }],
    ["Chromebook", UA.chromebook, 0, { apple: false, ios: false, chromium: true }],
    ["Firefox", UA.firefox, 0, { apple: false, ios: false, chromium: false }],
  ];
  for (const [navn, ua, maxTouchPoints, want] of rader) {
    it(navn, () => {
      const h = { maxTouchPoints };
      assert.deepEqual(
        { apple: isApple(ua, h), ios: isIOSLike(ua, h), chromium: isChromium(ua, h) },
        want,
      );
    });
  }

  it("Mac uten berøring er ikke iPad", () => {
    assert.equal(isIOSLike(UA.macSafari, { maxTouchPoints: 0 }), false);
    assert.equal(isIOSLike(UA.macSafari), false);
  });

  it("supportsWindowPlacement ser etter getScreenDetails", () => {
    assert.equal(supportsWindowPlacement({ getScreenDetails: () => {} }), true);
    assert.equal(supportsWindowPlacement({}), false);
    assert.equal(supportsWindowPlacement(undefined), false);
  });
});

describe("tavleUrl", () => {
  it("legger på visning=tavle", () => {
    assert.equal(tavleUrl("https://market.sundaysuite.app/host/abc/projector"), "https://market.sundaysuite.app/host/abc/projector?visning=tavle");
  });
  it("beholder eksisterende parametre og hash", () => {
    assert.equal(tavleUrl("https://x.no/host/a?foo=1&bar=2#del"), "https://x.no/host/a?foo=1&bar=2&visning=tavle#del");
  });
  it("overskriver en eksisterende visning-parameter", () => {
    assert.equal(tavleUrl("https://x.no/h?visning=annet&a=1"), "https://x.no/h?visning=tavle&a=1");
  });
  it("relativ sti forblir relativ", () => {
    assert.equal(tavleUrl("/host/a?x=1"), "/host/a?x=1&visning=tavle");
  });
  it("erTavleSok kjenner igjen resultatet", () => {
    assert.equal(erTavleSok("?a=1&visning=tavle"), true);
    assert.equal(erTavleSok("?visning=annet"), false);
    assert.equal(erTavleSok(""), false);
  });
});
