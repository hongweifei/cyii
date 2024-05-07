
class EUVElement {
    /**
     * @param { HTMLElement } element
     */
    constructor(element) {
        if (!element) {
            throw new Error("element is null");
        }
        this.domElement = element;
        this.tagName = element.tagName;
        this.attributes = new Map();
        this.tempDisplay = element.style.display;
        this.eventMethodMapping = new Map();
        this.eventInit = false;
        for (const a of element.attributes) {
            if (a.name[0] === '@') {
                this.eventMethodMapping.set(a.name.substring(1), a.value);
                continue;
            }
            this.attributes.set(a.name, a.value);
        }
        this.innerHTML = element.innerHTML;
        this.nodeTextContentMap = new Map();
        for (const node of element.childNodes) {
            if (node.nodeType !== Node.TEXT_NODE) {
                continue;
            }
            this.nodeTextContentMap.set(node, node.textContent);
        }

        this.parentElement = null;
        this.children = new Array(element.children.length);
        for(let i = 0; i < element.children.length; i++) {
            this.children[i] = new EUVElement(element.children[i]);
        }
    }

    getNodeTextContent(node) {
        return this.nodeTextContentMap.get(node);
    }
}

export class EUV {

    constructor(
        {
            elementSelector,
            mounted = () => {},
            data = {},
            methods = {},
            directives = {}
        } = {}
    ) {
        if (typeof mounted === "function") {
            this.mounted = mounted;
        } else {
            throw new Error("mounted must be a function");
        }
        const that = this;
        this.init = false;
        this.data = {...data};
        this.methods = {};
        // 没得 e-
        this.directiveMap = new Map();
        for (let k in directives) {
            if (directives[k].mounted && typeof directives[k].mounted !== "function") {
                throw new Error(`directives[${k}].mounted is not a function`);
            }
            this.directiveMap.set(k, directives[k]);
        }
        this.directive(
            "show",
            {
                updated(element, attributeValue, euvElement) {
                    const result = that.runExpressionCode(euvElement, attributeValue);
                    if (result) {
                        element.style.display = euvElement.tempDisplay ? euvElement.tempDisplay : "block";
                    } else {
                        element.style.display = "none";
                    }
                }
            }
        )

        this.dataElementMapping = new Map();
        const dataElementMapping = this.dataElementMapping;
        for(const k in data) {
            dataElementMapping[k] = new Set();
            Object.defineProperty(this.data, k, {
                get() {
                    if (
                        window.maybeChangeElement &&
                        window.maybeChangeElement instanceof EUVElement
                    ) {
                        // for(const set of dataElementMapping) {
                        //     if (set.has(window.maybeChangeElement.parentElement)) {
                        //         window.maybeChangeElement = null;
                        //         return data[k];
                        //     }
                        // }
                        // console.log("maybe change element", window.maybeChangeElement);
                        dataElementMapping[k].add(window.maybeChangeElement);
                        window.maybeChangeElement = null;
                        // console.log("data elements mapping:", dataElementMapping);
                    }
                    return data[k];
                },
                set(v) {
                    const oldValue = data[k];
                    if (oldValue === v) {
                        return;
                    }
                    data[k] = v;
                    console.log(`[${k}]set`, oldValue, "=>", v);
                    for (const el of dataElementMapping[k]) {
                        console.log("重新渲染", el);
                        that.renderEUVElement(el);
                    }
                    // console.log(dataElementMapping);
                }
            });
        }
        for(const k in methods) {
            Object.defineProperty(this.methods, k, {
                get() {
                    return methods[k];
                },
                set(v) {
                    if (typeof v !== "function") {
                        throw new Error("method must be a function");
                    }
                    methods[k] = v;
                }
            });
        }
        if (elementSelector) {
            this.mount(elementSelector);
        }
    }

    /**
     * 挂载 EUV APP
     * @param {*} elementSelector
     * @returns
     */
    mount(elementSelector) {
        if (!elementSelector || typeof elementSelector !== "string") {
            return;
        }
        /**
         * @type { HTMLElement }
         */
        this.mountedElement = document.querySelector(elementSelector);
        this.mountedElement.setAttribute("data-e-app", "");

        // 初始化元素
        const euvElement = new EUVElement(this.mountedElement);
        const initEUVElement = (parentElement) => {
            for (const e of parentElement.children) {
                e.parentElement = parentElement;
                initEUVElement(e);
            }
        };
        initEUVElement(euvElement);

        // 渲染DOM元素
        const renderDOMElement = (euvElement) => {
            for (const e of euvElement.children) {
                this.renderEUVElement(e);
                renderDOMElement(e);
            }
        };
        renderDOMElement(euvElement);

        this.init = true;
        if (this.mounted)
            this.mounted();
    }


    /**
     * 指令
     */
    directive(
        name,
        {
            mounted = (el, attributeValue) => {},
            unmount = (el) => {},
            updated = (el, attributeValue, euvElement) => {}
        }
    ) {
        if (typeof mounted !== "function") {
            throw new Error("mounted must be a function");
        }
        if (typeof unmount !== "function") {
            throw new Error("unmount must be a function");
        }
        if (typeof updated !== "function") {
            throw new Error("updated must be a function");
        }
        const d = {
            mounted,
            unmount,
            updated
        };
        this.directiveMap.set(name, d);
    }


    // 运行表达式
    runExpressionCode(euvElement, 表达式) {
        window.maybeChangeElement = euvElement;
        // console.log(euvElement, "run:", 表达式);

        // 获取 argNames
        const 获取codeArgNames = (str) => {
            if (!str) {
                return;
            }
            if (str === "in" || str === "of") {
                return;
            }

            // 数组或对象
            let splitCache = str.split("[");
            if (splitCache.length === 2) {
                str = splitCache[0];
                const strK = splitCache[1].split("]")[0];
                if (this.data[str]) {
                    const argNames = 获取codeArgNames.bind(this)(strK);
                    // console.log("strK:", strK);
                    // console.log("argNames:", argNames);
                    if (argNames) {
                        return [str, ...argNames];
                    } else {
                        return [str];
                    }
                }
            }
            // 对象
            splitCache = str.split(".");
            if (splitCache.length === 2) {
                str = splitCache[0];
                if (this.data[str]) {
                    return [str];
                }
            }

            if (this.data[str] || this.data[str] !== null) {
                return [str];
            }

            return;
        }

        let argNames = new Set();
        const args = new Set();
        const keys = 表达式.trim().split(" ");
        for (const k of keys) {
            const names = 获取codeArgNames(k);
            if (!names) continue;
            for(const n of names) {
                argNames.add(n);
            }
        }
        argNames.forEach((v) => {
            args.add(this.data[v]);
        });
        // console.log(表达式, keys, args);
        argNames = [...argNames].join(",");
        const f = new Function(
            argNames,
            `
                return ${表达式};
            `
        );
        window.maybeChangeElement = null;
        return f(...args.values());
    }

    /**
     *
     * @param { EUVElement } euvElement
     * @returns
     */
    renderEUVElement(euvElement) {
        if (!euvElement) {
            return;
        }
        if (!(euvElement instanceof EUVElement)) {
            // throw new Error("euvElement must be EUVElement");
            console.error("render element is not EUVElement", euvElement);
            return;
        }

        const domElement = euvElement.domElement;
        // 初始化 domElement 事件
        if (euvElement.domElement && !euvElement.eventInit) {
            for (const k of euvElement.eventMethodMapping.keys()) {
                const methodName = euvElement.eventMethodMapping.get(k);
                domElement.addEventListener(k, (e) => {
                    this.methods[methodName].bind(this)(e);
                });
                domElement.removeAttribute("@" + k);
            }
            euvElement.eventInit = true;
        }
        // 初始化指令，完成指令 mounted 动作
        if (!this.init) {
            for (const k of this.directiveMap.keys()) {
                const attributeName = "e-" + k;
                const attributeValue = domElement.getAttribute(attributeName);
                if (!attributeValue) {
                    continue;
                }
                const directive = this.directiveMap.get(k);
                if (directive.mounted) {
                    directive.mounted(domElement, attributeValue);
                }
            }
        }


        /**
         * 替换大括号中的内容
         * @param { Function } dealF 对大括号内容的处理，处理的结果替换原来的值
         */
        const replaceBraceValue = (domElement, dealF) => {
            function* getCodeFromTextContent(textContent) {
                let startIndex, codeEndIndex;
                let text = textContent;
                while((startIndex = text.indexOf("{{")) !== -1) {
                    codeEndIndex = text.indexOf("}}", startIndex);
                    if (codeEndIndex === -1) break;
                    const code = text.substring(startIndex + 2, codeEndIndex).trim();
                    const textEndIndex = codeEndIndex + 2;
                    yield {
                        beforeCode: text.substring(0, startIndex),
                        code,
                    };
                    text = text.substring(textEndIndex);
                    // console.log(text);
                }
            }

            function dealTextNode(node) {
                const str = node.textContent;
                const gen = getCodeFromTextContent(str);
                let { value, done } = gen.next();
                if (!done) {
                    node.textContent = "";
                }
                while(!done && value) {
                    const code = value.code;
                    const result = dealF(code);
                    // console.log(value);
                    node.textContent +=
                        value.beforeCode +
                        result;
                    // console.log(node.textContent);
                    ({ value, done } = gen.next());
                }
            }

            for (const node of domElement.childNodes) {
                if (node.nodeType !== Node.TEXT_NODE) {
                    continue;
                }
                dealTextNode(node);
            }
        }

        // 数据双向绑定
        const attributes = euvElement.attributes;
        for (const [name, a] of attributes) {
            // :attribute
            if (name[0] === ':') {
                const result = this.runExpressionCode(euvElement, a);
                const originalAttributeName = name.substring(1);
                domElement.setAttribute(originalAttributeName, result);
            }
            // e-model
            if (name.startsWith("e-model")) {
                const bindingAttribute = name.split(":")[1];
                if (!bindingAttribute) {
                    continue;
                }
                if (!this.data[a]) {
                    continue;
                }
                domElement.setAttribute(bindingAttribute, this.data[a]);
                if (domElement[bindingAttribute] !== undefined) {
                    domElement[bindingAttribute] = this.data[a];
                }
                const observerName = `${bindingAttribute}ChangeObserver`;
                if (!domElement[observerName]) {
                    domElement[observerName] = new MutationObserver((records) => {
                        for (const r of records) {
                            // console.log(r);
                            const newValue = r.target.getAttribute(r.attributeName);
                            if (this.data[a] !== undefined) {
                                this.data[a] = newValue;
                            }
                        }
                    });
                    domElement[observerName].observe(domElement, {
                        attributes: true,
                    });
                    const 修改属性值 = () => {
                        domElement.setAttribute(bindingAttribute, domElement.value);
                    };
                    domElement.onchange = 修改属性值
                    domElement.oninput = 修改属性值;
                    this.dataElementMapping[a].add(euvElement);
                }
            }
        }

        // {{}}
        // 还原 textNode 的内容
        for (const node of domElement.childNodes) {
            if (node.nodeType !== Node.TEXT_NODE) {
                continue;
            }
            const textContent = euvElement.getNodeTextContent(node);
            if (textContent) {
                node.textContent = textContent;
            }
        }
        replaceBraceValue(domElement, (code) => {
            return this.runExpressionCode(euvElement, code);
        });


        // 指令 updated
        for (const k of this.directiveMap.keys()) {
            const attributeName = "e-" + k;
            const attributeValue = domElement.getAttribute(attributeName);
            if (!attributeValue) {
                continue;
            }
            const directive = this.directiveMap.get(k);
            if (directive.updated) {
                directive.updated(domElement, attributeValue, euvElement);
            }
        }

        euvElement.domElement = domElement;
        return euvElement.domElement;
    }
}

