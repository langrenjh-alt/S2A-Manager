"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";

const motionSelectors = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "tbody tr",
  "[role='button']",
  "[class*='rounded-md'][class*='border']",
  "[class*='rounded-lg'][class*='border']",
  "[class*='rounded-xl'][class*='border']",
  "[data-motion='shell']",
  "[data-motion='sidebar']",
  "[data-motion='header']",
  "[data-motion='nav']",
  "[data-motion='section']",
  "[data-motion='panel']",
  "[data-motion='card']",
  "[data-motion='table']",
  "[data-motion='row']",
  "[data-motion='control']",
  "[data-motion='badge']",
  "[data-motion='dialog']",
  "[data-motion='toast']",
  "[data-motion='brand']",
].join(",");

const unreadyMotionSelectors = motionSelectors
  .split(",")
  .map((selector) => `${selector}:not([data-motion-ready])`)
  .join(",");

const hoverSelector = "[data-motion-hover],button,a[href],[role='button']";
const interactionMotionExcludedSelector = "[role='checkbox'],[role='switch'],input,textarea,select,[data-motion='none'],[data-motion-hover='none']";

function isVisible(element: HTMLElement) {
  if (element.dataset.motion === "dialog" || element.dataset.motion === "toast") return true;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function fromVars(kind: string | undefined) {
  if (!kind) return { x: 0, y: 8, scale: 0.992 };
  if (kind === "sidebar") return { x: -10, y: 0, scale: 0.995 };
  if (kind === "header" || kind === "nav") return { x: 0, y: -6, scale: 1 };
  if (kind === "dialog") return { x: 0, y: 10, scale: 0.985 };
  if (kind === "toast") return { x: 10, y: -6, scale: 0.99 };
  if (kind === "brand") return { x: 0, y: 0, scale: 0.96 };
  if (kind === "control" || kind === "badge") return { x: 0, y: 4, scale: 0.99 };
  if (kind === "row") return { x: 0, y: 4, scale: 1 };
  return { x: 0, y: 8, scale: 0.992 };
}

function markReady(element: HTMLElement) {
  element.dataset.motionReady = "true";
}

function hoverTarget(event: PointerEvent) {
  const target = (event.target as Element | null)?.closest<HTMLElement>(hoverSelector);
  if (!target || target.matches(":disabled,[aria-disabled='true']")) return null;
  if (target.matches(interactionMotionExcludedSelector)) return null;
  return target;
}

function movedInsideTarget(event: PointerEvent, target: HTMLElement) {
  return event.relatedTarget instanceof Node && target.contains(event.relatedTarget);
}

export function MotionOrchestrator() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let timeout = 0;
    document.documentElement.dataset.motionOrchestrated = "true";

    const animate = (root: ParentNode = document) => {
      const elements = [
        ...(root instanceof HTMLElement && root.matches(unreadyMotionSelectors) ? [root] : []),
        ...Array.from(root.querySelectorAll<HTMLElement>(unreadyMotionSelectors)),
      ]
        .filter(isVisible);

      if (elements.length === 0) return;

      if (reducedMotion) {
        elements.forEach(markReady);
        return;
      }

      const ordered = elements.sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top === bRect.top ? aRect.left - bRect.left : aRect.top - bRect.top;
      });

      ordered.forEach(markReady);

      const shell = ordered.filter((element) => element.dataset.motion === "shell");
      const sidebar = ordered.filter((element) => element.dataset.motion === "sidebar");
      const header = ordered.filter((element) => element.dataset.motion === "header" || element.dataset.motion === "nav");
      const content = ordered.filter((element) => !shell.includes(element) && !sidebar.includes(element) && !header.includes(element));

      const timeline = gsap.timeline({ defaults: { ease: "power3.out", overwrite: "auto" } });

      for (const group of [shell, sidebar, header, content]) {
        if (group.length === 0) continue;
        timeline.fromTo(
          group,
          (_index: number, target: Element) => ({
            autoAlpha: 0,
            ...fromVars((target as HTMLElement).dataset.motion),
          }),
          {
            autoAlpha: 1,
            x: 0,
            y: 0,
            scale: 1,
            duration: group === content ? 0.32 : 0.42,
            stagger: group === content ? 0.016 : 0.02,
            clearProps: "opacity,visibility,transform",
          },
          group === content ? "-=0.12" : "-=0.04",
        );
      }
    };

    const schedule = (root: ParentNode = document) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => animate(root));
    };

    schedule();
    timeout = window.setTimeout(() => schedule(), 120);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement) {
            schedule(node.matches(motionSelectors) ? node.parentElement ?? document : node);
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const handlePointerEnter = (event: PointerEvent) => {
      if (reducedMotion) return;
      const target = hoverTarget(event);
      if (!target || movedInsideTarget(event, target)) return;
      const hoverMode = target.dataset.motionHover ?? (target.matches("button,a[href],[role='button']") ? "lift" : "scale");
      gsap.to(target, {
        y: hoverMode === "lift" ? -0.75 : -0.2,
        scale: hoverMode === "scale" ? 1.003 : 1,
        duration: 0.22,
        ease: "power2.out",
        overwrite: "auto",
      });
    };

    const handlePointerLeave = (event: PointerEvent) => {
      if (reducedMotion) return;
      const target = hoverTarget(event);
      if (!target || movedInsideTarget(event, target)) return;
      gsap.to(target, { y: 0, scale: 1, duration: 0.24, ease: "power2.out", overwrite: "auto", clearProps: "transform" });
    };

    document.addEventListener("pointerover", handlePointerEnter);
    document.addEventListener("pointerout", handlePointerLeave);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer.disconnect();
      document.removeEventListener("pointerover", handlePointerEnter);
      document.removeEventListener("pointerout", handlePointerLeave);
    };
  }, [pathname]);

  return null;
}
