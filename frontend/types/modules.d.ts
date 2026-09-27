declare module '*.wasm?url' {
    const url: string;
    export default url;
}

declare module '*.js?url' {
    const url: string;
    export default url;
}

declare module '*.ts?worker&module' {
    const WorkerFactory: {
        new (): Worker;
    };
    export default WorkerFactory;
}

declare module '*.ts?worker&module&inline' {
    const WorkerFactory: {
        new (): Worker;
    };
    export default WorkerFactory;
}
