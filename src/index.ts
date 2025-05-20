type DBConfig = {
    name: string;
    version: number;
    stores: {
        name: string;
        keyPath?: string | string[];
        autoIncrement?: boolean;
    }[];
};

export class IndexDBWrapper {
    private db: IDBDatabase | null = null;

    constructor(private config: DBConfig) { }

    /** 打开数据库 */
    async open(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.config.name, this.config.version);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                this.config.stores.forEach(store => {
                    if (!db.objectStoreNames.contains(store.name)) {
                        db.createObjectStore(store.name, {
                            keyPath: store.keyPath,
                            autoIncrement: store.autoIncrement
                        });
                    }
                });
            };

            request.onsuccess = (event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(new Error('打开数据库失败'));
            };
        });
    }

    /** 插入数据 */
    async add<T>(storeName: string, data: T): Promise<IDBValidKey> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /** 获取数据 */
    async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        })
    }
    /** 更新数据 */
    async put<T>(storeName: string, data: T): Promise<IDBValidKey> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {

            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        })
    }
    /** 删除数据 */
    async delete(storeName: string, key: IDBValidKey): Promise<void> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        })
    }
    /** 清空数据 */
    async clear(storeName: string): Promise<void> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        })
    }
    /** 获取所有数据 */
    async getAll<T>(storeName: string): Promise<T[]> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        })
    }
    /** 关闭数据库 */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
    /** 删除数据库 */
    deleteDB(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        indexedDB.deleteDatabase(this.config.name);
    }
    /** 获取数据库 */
    getDB(): IDBDatabase | null {
        return this.db;
    }
    /** 获取数据库名称 */
    getName(): string {
        return this.config.name;
    }
    /** 获取数据库版本 */
    getVersion(): number {
        return this.config.version;
    }
    /** 获取数据库存储 */
    getStores(): DBConfig['stores'] {
        return this.config.stores;
    }
    /** 获取数据库配置 */
    getConfig(): DBConfig {
        return this.config;
    }
    /** 设置数据库配置 */
    setConfig(config: DBConfig): void {
        this.config = config;
    }
}