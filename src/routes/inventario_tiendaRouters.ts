
import { Router } from 'express';
import { inventario_tiendaController } from '../controllers/inventario_tiendaController';
import { categoriaController } from '../controllers/categoriasController';

// SEGURIDAD [CODE-01]:
// Se retira temporalmente la importación de validarToken,
// ya que todavía no se aplica en los endpoints.
// La autenticación y autorización se integrarán después
// de revisar y corregir el middleware correspondiente.

class Inventario_tiendaRoutes {

    public router: Router = Router();

    constructor() {
        this.config();
    }

    config(): void {

        // ==========================================
        // RUTAS DE INVENTARIO
        // ==========================================

        // PENDIENTE [AUTH-01, AUTH-02]:
        // Agregar autenticación y autorización administrativa.

        this.router.put(
        '/actualizar_tienda/:id',
            inventario_tiendaController.editar_producto
        );

        this.router.post(
            '/agregar_producto/',
            inventario_tiendaController.agregar_producto
        );

        this.router.delete(
            '/eliminar_producto/:id',
            inventario_tiendaController.eliminar_producto
        );

        this.router.get(
            '/mostrar_todos_productos/',
            inventario_tiendaController.mostrar_productos
        );

        // ==========================================
        // RUTAS DE CATEGORÍAS
        // ==========================================

        // SEGURIDAD [VAL-01]:
        // Los identificadores recibidos por estas rutas
        // se validan en categoriasController.ts.

        // PENDIENTE [AUTH-01, AUTH-02]:
        // Las operaciones administrativas deberán
        // protegerse mediante autenticación y permisos.

        this.router.put(
            '/actualizar_categoria/:id',
            categoriaController.editarCategoria
        );

        this.router.post(
            '/crear_categoria/',
            categoriaController.agregarCategoria
        );

        // CORRECCIÓN [ROUTE-01]:
        // Se agrega "/" antes de :id para reconocer
        // correctamente el parámetro de la URL.
        this.router.delete(
            '/eliminar_categoria/:id',
            categoriaController.eliminarCategoria
        );

        this.router.get(
            '/mostrar_categorias/',
            categoriaController.mostrarCategorias
        );
    }
}

const inventario_tiendaRoutes = new Inventario_tiendaRoutes();

export default inventario_tiendaRoutes.router;
