
class EUVElement {
    /**
     * @param { HTMLElement } element
     */
    constructor(element) {
        if (!element) {
            throw new Error("element is null");
        }
        this.element = element;
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
        this.textNodeOriginalContentMap = new Map();
        for (const node of element.childNodes) {
            if (node.nodeName !== "#text") {
                continue;
            }
            this.textNodeOriginalContentMap.set(node, node.textContent);
        }

        this.parentElement = null;
        this.children = new Array(element.children.length);
        for(let i = 0; i < element.children.length; i++) {
            this.children[i] = new EUVElement(element.children[i]);
        }
    }
}

export class EUV {

    constructor(
        {
            elementSelector,
            mounted = () => {},
            data = {},
            methods = {},
        } = {}
    ) {
        const that = this;
        this.init = false;
        this.data = {...data};
        if (typeof mounted === "function") {
            this.mounted = mounted;
        } else {
            throw new Error("mounted must be a function");
        }

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
                        for(const set of dataElementMapping) {
                            if (set.has(window.maybeChangeElement.parentElement)) {
                                window.maybeChangeElement = null;
                                return data[k];
                            }
                        }
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
        this.methods = {};
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
        this.mount(elementSelector);
        mounted();
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

        // 删除DOM元素
        // this.mountedElement.innerHTML = "";
        // 渲染DOM元素
        const renderDOMElement = (euvElement, parentElement) => {
            for (const e of euvElement.children) {
                const domElement = this.renderEUVElement(e);
                parentElement.appendChild(domElement);
                renderDOMElement(e, domElement);
            }
        };
        renderDOMElement(euvElement, this.mountedElement);

        this.init = true;
        if (this.mounted)
            this.mounted();
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

        const element = euvElement.element;
        if (euvElement.element && !euvElement.eventInit) {
            for (const k of euvElement.eventMethodMapping.keys()) {
                const methodName = euvElement.eventMethodMapping.get(k);
                element.addEventListener(k, (e) => {
                    this.methods[methodName].bind(this)(e);
                });
            }
            euvElement.eventInit = true;
        }


        /**
         * 替换大括号中的内容
         * @param { Function } dealF 对大括号内容的处理，处理的结果替换原来的值
         */
        const replaceBraceValue = (element, dealF) => {
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
                    console.log(text);
                }
            }

            function dealNode(node) {
                const str = node.textContent;
                const gen = getCodeFromTextContent(str);
                let { value, done } = gen.next();
                if (!done) {
                    node.textContent = "";
                }
                while(!done && value) {
                    const code = value.code;
                    const result = dealF(code);
                    console.log(value);
                    node.textContent +=
                        value.beforeCode +
                        result;
                    console.log(node.textContent);
                    ({ value, done } = gen.next());
                }
            }

            for (const node of element.childNodes) {
                if (node.nodeName !== "#text") {
                    continue;
                }
                dealNode(node);
            }
        }

        // 运行表达式
        const runCode = (表达式) => {
            window.maybeChangeElement = euvElement;
            // console.log(element, "run:", 表达式);

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

        const attributes = euvElement.attributes;
        for (const [name, a] of attributes) {
            // :attribute
            if (name[0] === ':') {
                const result = runCode(a);
                const originalAttributeName = name.substring(1);
                element.setAttribute(originalAttributeName, result);
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
                element.setAttribute(bindingAttribute, this.data[a]);
                if (element[bindingAttribute] !== undefined) {
                    element[bindingAttribute] = this.data[a];
                }
                const observerName = `${bindingAttribute}ChangeObserver`;
                if (!element[observerName]) {
                    element[observerName] = new MutationObserver((records) => {
                        for (const r of records) {
                            // console.log(r);
                            const newValue = r.target.getAttribute(r.attributeName);
                            if (this.data[a] !== undefined) {
                                this.data[a] = newValue;
                            }
                        }
                    });
                    element[observerName].observe(element, {
                        attributes: true,
                    });
                    const 修改属性值 = () => {
                        element.setAttribute(bindingAttribute, element.value);
                    };
                    element.onchange = 修改属性值
                    element.oninput = 修改属性值;
                    this.dataElementMapping[a].add(euvElement);
                }
            }
        }

        // e-show
        const eShow = element.getAttribute("e-show");
        if (eShow) {
            const result = runCode(eShow);
            if (result) {
                element.style.display = euvElement.tempDisplay ? euvElement.tempDisplay : "block";
            } else {
                element.style.display = "none";
            }
        }

        // {{}}
        for (const node of element.childNodes) {
            if (node.nodeName !== "#text") {
                continue;
            }
            const textContent = euvElement.textNodeOriginalContentMap.get(node);
            if (textContent) {
                node.textContent = textContent;
            }
        }
        replaceBraceValue(element, (code) => {
            return runCode(code);
        });

        euvElement.element = element;
        return euvElement.element;
    }
}

