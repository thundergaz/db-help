type DBConfig = {
    name: string;
    version: number;
    stores: {
        name: string;
        keyPath?: string | string[]; // 数组表示复合键
        autoIncrement?: boolean;
        indexes?: {  // 新增：索引配置数组
            name: string;          // 索引名称（必填）
            keyPath: string | string[];  // 索引键路径（必填）
            unique?: boolean;      // 是否唯一（可选，默认 false）
        }[];
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
                    // 1. 创建/获取 Object Store
                    let objectStore: IDBObjectStore;
                    if (!db.objectStoreNames.contains(store.name)) {
                        objectStore = db.createObjectStore(store.name, {
                            keyPath: store.keyPath,
                            autoIncrement: store.autoIncrement
                        });
                    } else {
                        // 升级时需以读写模式重新获取 Object Store
                        const transaction = db.transaction(store.name, 'versionchange');
                        objectStore = transaction.objectStore(store.name);
                    }
                    // 2. 处理索引：创建新索引或更新现有索引
                    const existingIndexes = Array.from(objectStore.indexNames);
                    (store.indexes || []).forEach(index => {
                        // 若索引已存在但配置不同（如 unique 变化），需先删除再创建
                        if (existingIndexes.includes(index.name)) {
                            const currentIndex = objectStore.index(index.name);
                            if (currentIndex.keyPath !== index.keyPath || currentIndex.unique !== (index.unique || false)) {
                                objectStore.deleteIndex(index.name);
                                objectStore.createIndex(index.name, index.keyPath, { unique: index.unique });
                            }
                        } else {
                            // 新增索引
                            objectStore.createIndex(index.name, index.keyPath, { unique: index.unique });
                        }
                    });
                    existingIndexes.forEach(existingIndexName => {
                        const isIndexConfigured = (store.indexes || []).some(
                            index => index.name === existingIndexName
                        );
                        if (!isIndexConfigured) {
                            objectStore.deleteIndex(existingIndexName);
                        }
                    });
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

    /** 插入数据（支持通过索引验证） */
    async add<T>(storeName: string, data: T): Promise<IDBValidKey> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            // 由于 IDBIndex 上不存在 add 方法，直接使用 store.add 方法添加数据
            const request = store.add(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /** 获取数据（优先使用索引） */
    async get<T>(storeName: string, key: IDBValidKey, indexName?: string): Promise<T | undefined> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = indexName ? store.index(indexName).get(key) : store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        })
    }
    /** 更新数据（优先使用索引定位） */
    async put<T>(storeName: string, data: T, indexName?: string): Promise<IDBValidKey> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {

            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            // 由于 IDBIndex 上不存在 put 方法，我们需要先通过索引找到对应的主键，再使用主键更新数据
            if (indexName) {
                const index = store.index(indexName);
                const indexKeyPathValue = (data as any)['keyPath'];
                const getKeyRequest = index.getKey(indexKeyPathValue);
                getKeyRequest.onsuccess = () => {
                    const key = getKeyRequest.result;
                    if (key) {
                        const putRequest = store.put(data, key);
                        putRequest.onsuccess = () => resolve(putRequest.result);
                        putRequest.onerror = () => reject(putRequest.error);
                    } else {
                        reject(new Error('未通过索引找到对应的主键'));
                    }
                };
                getKeyRequest.onerror = () => reject(getKeyRequest.error);
            } else {
                const request = store.put(data);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            }
        })
    }
    /** 增量更新数据（仅更新部分字段） */
    async incrementalUpdate<T extends object>(storeName: string, key: IDBValidKey, partialData: Partial<T>): Promise<IDBValidKey> {
        if (!this.db) throw new Error('数据库未打开');
        // 1. 获取现有数据
        const existingData = await this.get<T>(storeName, key);
        if (!existingData) {
            throw new Error(`数据不存在，键为: ${JSON.stringify(key)}`);
        }
        // 2. 合并部分数据（使用对象展开实现浅合并，如需深合并可扩展）
        const updatedData = { ...existingData, ...partialData };
        // 3. 使用 put 方法保存更新后的数据
        return this.put(storeName, updatedData);
    }
    /** 删除数据（优先使用索引定位） */
    async delete(storeName: string, key: IDBValidKey, indexName?: string): Promise<void> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            // 由于 IDBIndex 上不存在 delete 方法，需要先通过索引获取主键，再使用主键删除数据
            const request = indexName
                ? (() => {
                    const index = store.index(indexName);
                    const getKeyRequest = index.getKey(key);
                    const deleteRequest = store.delete(0); // 临时初始化，后续会替换
                    getKeyRequest.onsuccess = () => {
                        const primaryKey = getKeyRequest.result;
                        if (primaryKey) {
                            const newDeleteRequest = store.delete(primaryKey);
                            // 将 deleteRequest 替换为实际的删除请求
                            Object.assign(deleteRequest, newDeleteRequest);
                        } else {
                            deleteRequest.onerror = () => reject(new Error('未通过索引找到对应的主键'));
                        }
                    };
                    getKeyRequest.onerror = () => reject(getKeyRequest.error);
                    return deleteRequest;
                })()
                : store.delete(key);
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

    /** 获取范围条件所有数据
     * @param storeName 存储名称
     * @param indexName 索引名称
     * @param range 范围
     * @returns 数据数组
     * @example
     * const ageRange = IDBKeyRange.bound(20, 30);
     * const users = await dbWrapper.getAllByIndexRange("users", "ageIndex", ageRange);
     */
    async getAllByIndexRange<T>(storeName: string, indexName: string, range: IDBKeyRange): Promise<T[]> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(range); // 获取范围内所有数据

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        })
    }

    /** 获取索引数据 索引值不唯一
     * @param storeName 存储名称
     * @param indexName 索引名称
     * @param key 索引键
     * @returns 数据数组
     * @example
     * const users = await dbWrapper.getByIndex("users", "ageIndex", 25);
     * console.log(users);
     */
    async getByIndexAll<T>(storeName: string, indexName: string, key: IDBValidKey): Promise<T[]> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(key); // 获取索引键对应的所有数据
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        })
    }

    /** 获取索引数据 索引值唯一
     * @param storeName 存储名称
     * @param indexName 索引名称
     * @param key 索引键
     * @returns 数据
     * @example
     * const user = await dbWrapper.getByIndex("users", "nameIndex", "John");
     * console.log(user);
     */
    async getByIndex<T>(storeName: string, indexName: string, key: IDBValidKey): Promise<T | undefined> {
        if (!this.db) throw new Error('数据库未打开');
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.get(key); // 获取索引键对应的单个数据
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