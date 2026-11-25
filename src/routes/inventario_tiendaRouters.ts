import { Router } from 'express';
import { inventario_tiendaController } from '../controllers/inventario_tiendaController';
import { categoriaController } from '../controllers/categoriasController';
import { validarToken } from '../middleware/auth';
import { autorizarRoles, RolUsuario } from '../middleware/autorizarRoles';

class Inventario_tiendaRoutes {
    public router: Router = Router();

    constructor() {
        this.config();
    }

    config(): void {
        // SEGURIDAD [AUTH-01]: solo Administrador puede modificar inventario.
        this.router.put(
            '/actualizar_tienda/:id',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            inventario_tiendaController.editar_producto
        );
        this.router.post(
            '/agregar_producto/',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            inventario_tiendaController.agregar_producto
        );
        this.router.delete(
            '/eliminar_producto/:id',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            inventario_tiendaController.eliminar_producto
        );

        // Catálogo público: no incluye precio_compra.
        this.router.get(
            '/mostrar_todos_productos/',
            inventario_tiendaController.mostrar_productos
        );

        // Vista interna para administradores (con precio_compra).
        this.router.get(
            '/mostrar_todos_productos_admin/',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            inventario_tiendaController.mostrar_productos_admin
        );

        // SEGURIDAD [AUTH-02]: controlar también los endpoints de categorías.
        this.router.put(
            '/actualizar_categoria/:id',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            categoriaController.editarCategoria
        );
        this.router.post(
            '/crear_categoria/',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            categoriaController.agregarCategoria
        );
        this.router.delete(
            '/eliminar_categoria/:id',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            categoriaController.eliminarCategoria
        );
        this.router.get(
            '/mostrar_categorias/',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            categoriaController.mostrarCategorias
        );
    }
}

const inventario_tiendaRoutes = new Inventario_tiendaRoutes();
export default inventario_tiendaRoutes.router;
