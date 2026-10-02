import { Router } from 'express';
import { inventario_tiendaController } from '../controllers/inventario_tiendaController';
import { categoriaController } from '../controllers/categoriasController';
import { validarToken } from '../middleware/auth';

class Inventario_tiendaRoutes{
    public router: Router = Router();
    constructor(){
        this.config();
    }

    config() : void{
        this.router.put('/actualizar_tienda/:id', inventario_tiendaController.editar_producto);
        this.router.post('/agregar_producto/', inventario_tiendaController.agregar_producto);
        this.router.delete('/eliminar_producto/:id',inventario_tiendaController.eliminar_producto); 
        this.router.get('/mostrar_todos_productos/', inventario_tiendaController.mostrar_productos);

        this.router.put('/actualizar_categoria/:id', categoriaController.editarCategoria);
        this.router.post('/crear_categoria/', categoriaController.agregarCategoria);
        this.router.delete('/eliminar_categoria:id',categoriaController.eliminarCategoria); 
        this.router.get('/mostrar_categorias/', categoriaController.mostrarCategorias);


    }
}

const inventario_tiendaRoutes = new Inventario_tiendaRoutes();
export default inventario_tiendaRoutes.router;